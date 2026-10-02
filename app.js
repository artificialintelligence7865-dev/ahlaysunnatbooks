// app.js - public site: live book list, search + category filter, theme toggle, PDF reader modal.
import { db, initAdmin, CATEGORIES } from "./admin.js";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
let books = [];            // all books from Firestore
let activeCategory = "All";
let searchTerm = "";

// Escape text before putting it in innerHTML (prevents XSS from book metadata)
const esc = (s = "") => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Theme (dark / light) ---------- */
function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("theme", dark ? "dark" : "light");
}
applyTheme(localStorage.getItem("theme") === "dark");
$("#themeToggle").onclick = () => applyTheme(!document.documentElement.classList.contains("dark"));

/* ---------- Category chips ---------- */
function renderCategories() {
  $("#categoryBar").innerHTML = ["All", ...CATEGORIES].map((c) =>
    `<button data-cat="${c}" class="px-4 py-1.5 rounded-full border whitespace-nowrap ${c === activeCategory
      ? "bg-brand text-white border-brand" : "border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"}">${c}</button>`).join("");
  $("#categoryBar").querySelectorAll("button").forEach((b) => b.onclick = () => { activeCategory = b.dataset.cat; renderCategories(); renderBooks(); });
}

/* ---------- Book grid with search + filter ---------- */
function renderBooks() {
  const q = searchTerm.trim().toLowerCase();
  const list = books.filter((b) =>
    (activeCategory === "All" || b.category === activeCategory) &&
    (!q || `${b.title} ${b.author}`.toLowerCase().includes(q)));

  $("#gridTitle").textContent = activeCategory === "All" ? "All books" : activeCategory;
  $("#emptyState").classList.toggle("hidden", list.length > 0);
  $("#bookGrid").innerHTML = list.map((b) => `
    <article class="flex flex-col rounded-lg overflow-hidden bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
      ${b.coverUrl
        ? `<img src="${esc(b.coverUrl)}" alt="Cover of ${esc(b.title)}" loading="lazy" class="aspect-[3/4] w-full object-cover" />`
        : `<div class="aspect-[3/4] bg-brand-dark text-gold flex items-center justify-center"><i data-lucide="book-open-text" class="w-12 h-12"></i></div>`}
      <div class="p-4 flex flex-col gap-1 flex-1">
        <h3 dir="auto" class="font-display text-lg font-bold leading-snug">${esc(b.title)}</h3>
        <p dir="auto" class="text-sm text-stone-500">${esc(b.author)}</p>
        <p class="text-xs text-gold font-semibold">${esc(b.category)}</p>
        <button data-read="${b.id}" class="mt-auto pt-3 w-full py-2 rounded-lg bg-brand text-white hover:bg-brand-dark">Read book</button>
      </div>
    </article>`).join("");
  $("#bookGrid").querySelectorAll("[data-read]").forEach((btn) => btn.onclick = () => openReader(btn.dataset.read));
  lucide.createIcons();
}

// Both search boxes (navbar + hero) stay in sync
document.querySelectorAll(".search-input").forEach((inp) => inp.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  document.querySelectorAll(".search-input").forEach((o) => { if (o !== e.target) o.value = searchTerm; });
  renderBooks();
}));

/* ---------- PDF reader modal ---------- */
function openReader(id) {
  const book = books.find((b) => b.id === id);
  if (!book) return;
  $("#readerTitle").textContent = book.title;
  $("#readerOpen").href = book.pdfUrl;
  $("#readerFrame").src = book.pdfUrl;            // browser's built-in PDF viewer
  $("#readerModal").classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  // Count the read (Firestore rules allow public updates to the "reads" field only)
  updateDoc(doc(db, "books", id), { reads: increment(1) }).catch(() => {});
}
function closeReader() {
  $("#readerModal").classList.add("hidden");
  $("#readerFrame").src = "about:blank";
  document.body.classList.remove("overflow-hidden");
}
$("#readerClose").onclick = closeReader;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeReader(); });

/* ---------- Live data from Firestore ---------- */
onSnapshot(query(collection(db, "books"), orderBy("createdAt", "desc")), (snap) => {
  books = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderBooks();
  // Let admin.js refresh its table and metrics
  document.dispatchEvent(new CustomEvent("books:updated", { detail: books }));
}, (err) => { $("#emptyState").textContent = "Could not load books. Check your Firebase setup."; $("#emptyState").classList.remove("hidden"); console.error(err); });

renderCategories();
renderBooks();
initAdmin();
lucide.createIcons();
