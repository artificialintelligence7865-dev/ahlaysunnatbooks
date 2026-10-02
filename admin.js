// admin.js - Firebase setup + admin-only features (login, upload, edit, delete).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

/* ====== 1. CONFIG: paste your values from Firebase Console > Project settings ====== */
const firebaseConfig = {
  const firebaseConfig = {
  apiKey: "AIzaSyCi1q0p8pnmDxtzYc5WeuJEN5GQSE8ECWQ",
  authDomain: "ahlaysunnatbooks.firebaseapp.com",
  projectId: "ahlaysunnatbooks",
  storageBucket: "ahlaysunnatbooks.firebasestorage.app",
  messagingSenderId: "157623542830",
  appId: "1:157623542830:web:544cc54ace2438dd17ebbf",
  measurementId: "G-1SXMRL94FW"
};
// UID(s) of the admin user(s) (Firebase Console > Authentication > Users). Must match the UID in your security rules.
["const ADMIN_UIDS = ["ljloRpX356Z1sVxeolQgFjKhvCD3"];"];
export const CATEGORIES = ["Hadith", "Fiqh", "Seerat", "Aqeedah"];

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const storage = getStorage(app);

const $ = (s) => document.querySelector(s);
let books = [];
let editingId = null;
const isAdmin = (u) => !!u && ADMIN_UIDS.includes(u.uid);
const esc = (s = "") => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ====== 2. Auth: login modal, admin gate ====== */
function showView(admin) {
  $("#adminView").classList.toggle("hidden", !admin);
  $("#publicView").classList.toggle("hidden", admin);
  $("#adminBtnText").textContent = admin ? "Log out" : "Admin login";
}

export function initAdmin() {
  $("#fCategory").innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join("");

  // Button opens login modal, or logs out when already signed in
  $("#adminBtn").onclick = () => auth.currentUser ? signOut(auth) : $("#loginModal").classList.remove("hidden");
  $("#loginCancel").onclick = () => $("#loginModal").classList.add("hidden");

  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    $("#loginMsg").textContent = "";
    try {
      const { user } = await signInWithEmailAndPassword(auth, $("#loginEmail").value, $("#loginPass").value);
      if (!isAdmin(user)) { await signOut(auth); throw new Error("This account is not an admin."); }
      $("#loginModal").classList.add("hidden");
      $("#loginForm").reset();
    } catch (err) {
      $("#loginMsg").textContent = err.message.includes("auth/") ? "Email or password is incorrect." : err.message;
    }
  };

  // Show the dashboard only for verified admins; everyone else sees the public site
  onAuthStateChanged(auth, (user) => showView(isAdmin(user)));

  $("#bookForm").onsubmit = saveBook;
  $("#cancelEdit").onclick = resetForm;
  document.addEventListener("books:updated", (e) => { books = e.detail; renderTable(); });
}

/* ====== 3. Metrics + management table ====== */
function renderTable() {
  $("#statBooks").textContent = books.length;
  $("#statReads").textContent = books.reduce((n, b) => n + (b.reads || 0), 0);
  $("#statCats").textContent = new Set(books.map((b) => b.category)).size;
  $("#bookTable").innerHTML = books.map((b) => `
    <tr class="border-t border-stone-200 dark:border-stone-800">
      <td class="p-3" dir="auto">${esc(b.title)}</td><td class="p-3" dir="auto">${esc(b.author)}</td>
      <td class="p-3">${esc(b.category)}</td><td class="p-3">${b.reads || 0}</td>
      <td class="p-3 whitespace-nowrap">
        <button data-edit="${b.id}" class="text-brand dark:text-emerald-400 underline mr-3">Edit</button>
        <button data-del="${b.id}" class="text-red-600 underline">Delete</button>
      </td>
    </tr>`).join("") || `<tr><td class="p-6 text-stone-500" colspan="5">No books yet. Add your first book above.</td></tr>`;
  $("#bookTable").querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => startEdit(b.dataset.edit));
  $("#bookTable").querySelectorAll("[data-del]").forEach((b) => b.onclick = () => removeBook(b.dataset.del));
}

/* ====== 4. Add / edit / delete ====== */
// Uploads a file to Storage and reports progress; resolves with { url, path }
function upload(file, folder) {
  return new Promise((resolve, reject) => {
    const path = `${folder}/${Date.now()}_${file.name.replace(/[^\w.-]/g, "_")}`;
    const task = uploadBytesResumable(ref(storage, path), file);
    $("#progressWrap").classList.remove("hidden");
    task.on("state_changed",
      (s) => { $("#progressBar").style.width = `${(s.bytesTransferred / s.totalBytes) * 100}%`; },
      reject,
      async () => resolve({ url: await getDownloadURL(task.snapshot.ref), path }));
  });
}
const safeDelete = (path) => path ? deleteObject(ref(storage, path)).catch(() => {}) : Promise.resolve();

async function saveBook(e) {
  e.preventDefault();
  if (!isAdmin(auth.currentUser)) return;                 // client-side guard (rules enforce it server-side)
  const old = books.find((b) => b.id === editingId);
  const pdfFile = $("#fPdf").files[0], coverFile = $("#fCoverFile").files[0];
  if (!editingId && !pdfFile) { $("#formMsg").textContent = "Choose a PDF file to publish."; return; }

  $("#saveBtn").disabled = true;
  $("#formMsg").textContent = "Saving...";
  try {
    const data = {
      title: $("#fTitle").value.trim(), author: $("#fAuthor").value.trim(),
      category: $("#fCategory").value, description: $("#fDesc").value.trim(),
      coverUrl: $("#fCoverUrl").value.trim() || old?.coverUrl || "",
    };
    if (coverFile) {
      const c = await upload(coverFile, "covers");
      await safeDelete(old?.coverPath);
      Object.assign(data, { coverUrl: c.url, coverPath: c.path });
    }
    if (pdfFile) {
      const p = await upload(pdfFile, "books");
      await safeDelete(old?.pdfPath);
      Object.assign(data, { pdfUrl: p.url, pdfPath: p.path });
    }
    if (editingId) await updateDoc(doc(db, "books", editingId), data);
    else await addDoc(collection(db, "books"), { ...data, reads: 0, createdAt: serverTimestamp() });
    resetForm();
    $("#formMsg").textContent = "Book saved.";
  } catch (err) {
    console.error(err);
    $("#formMsg").textContent = "Could not save the book. Check your connection and admin permissions.";
  } finally {
    $("#saveBtn").disabled = false;
    $("#progressWrap").classList.add("hidden");
    $("#progressBar").style.width = "0";
  }
}

function startEdit(id) {
  const b = books.find((x) => x.id === id);
  if (!b) return;
  editingId = id;
  $("#fTitle").value = b.title; $("#fAuthor").value = b.author; $("#fCategory").value = b.category;
  $("#fCoverUrl").value = b.coverUrl || ""; $("#fDesc").value = b.description || "";
  $("#formTitle").textContent = "Edit book (leave PDF empty to keep the current file)";
  $("#saveBtn").textContent = "Save changes";
  $("#cancelEdit").classList.remove("hidden");
  $("#bookForm").scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
  editingId = null;
  $("#bookForm").reset();
  $("#formTitle").textContent = "Add new book";
  $("#saveBtn").textContent = "Publish book";
  $("#cancelEdit").classList.add("hidden");
}

async function removeBook(id) {
  const b = books.find((x) => x.id === id);
  if (!b || !confirm(`Delete "${b.title}"? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, "books", id));
    await Promise.all([safeDelete(b.pdfPath), safeDelete(b.coverPath)]);
  } catch (err) { alert("Could not delete the book. Check your admin permissions."); }
}
