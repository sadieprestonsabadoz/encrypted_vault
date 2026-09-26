import { initializeApp }
from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  onAuthStateChanged
}
from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc
}
from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";


// =====================================================
// PASTE YOUR FIREBASE CONFIGURATION HERE
// Replace the example values below with YOUR values.
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyBxV4vIfUaWTPlJmxpydrwxPeRt9O1xuo0",
    authDomain: "encryted-vault.firebaseapp.com",
    projectId: "encryted-vault",
    storageBucket: "encryted-vault.firebasestorage.app",
    messagingSenderId: "386990620495",
    appId: "1:386990620495:web:1c9cb54a4d620d452a8f3a"
  };


// =====================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let vaultData = [];
let currentPassword = "";
let currentUser = null;


// ---------- STARTUP ----------

document.addEventListener("DOMContentLoaded", async () => {

  loadTheme();

  document
    .getElementById("settingsBtn")
    .addEventListener("click", () => {
      document
        .getElementById("settingsPanel")
        .classList.toggle("hidden");
    });

  document
    .querySelectorAll('input[name="theme"]')
    .forEach(option => {
      option.addEventListener("change", changeTheme);
    });

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.error(error);
  }

  onAuthStateChanged(auth, async user => {

    currentUser = user;

    if (!user) {
      showScreen("connectScreen");
      return;
    }

    await checkForVault();
  });

});


// ---------- THEME ----------

function loadTheme() {

  const theme = localStorage.getItem("vaultTheme") || "dark";

  document.body.classList.toggle(
    "light",
    theme === "light"
  );

  const option =
    document.querySelector(
      `input[name="theme"][value="${theme}"]`
    );

  if (option) {
    option.checked = true;
  }
}


function changeTheme(event) {

  const theme = event.target.value;

  document.body.classList.toggle(
    "light",
    theme === "light"
  );

  localStorage.setItem("vaultTheme", theme);
}


// ---------- SCREEN CONTROL ----------

function showScreen(id) {

  [
    "connectScreen",
    "setupScreen",
    "lockedScreen",
    "vaultScreen"
  ].forEach(screen => {

    document
      .getElementById(screen)
      .classList.add("hidden");

  });

  document
    .getElementById(id)
    .classList.remove("hidden");
}


// ---------- FIREBASE LOGIN ----------

window.connectVault = async function () {

  const email =
    document.getElementById("firebaseEmail").value.trim();

  const password =
    document.getElementById("firebasePassword").value;

  const message =
    document.getElementById("connectMessage");

  message.textContent = "Connecting...";

  try {

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    // Do not keep the Firebase password in the form.
    document.getElementById("firebasePassword").value = "";

    message.textContent = "";

  } catch (error) {

  console.error(error);

  message.textContent =
    "Connection error: " + error.code;
  }
};


// ---------- FIND THIS USER'S VAULT ----------

function getVaultReference() {

  if (!currentUser) {
    throw new Error("Not authenticated");
  }

  return doc(
    db,
    "vaults",
    currentUser.uid
  );
}


async function checkForVault() {

  try {

    const snapshot =
      await getDoc(getVaultReference());

    if (snapshot.exists()) {
      showScreen("lockedScreen");
    } else {

      document.getElementById("setupItems").innerHTML = "";

      addSetupItem();

      showScreen("setupScreen");
    }

  } catch (error) {

    console.error(error);

    showScreen("connectScreen");

    document.getElementById("connectMessage").textContent =
      "The database couldn't be accessed. Check the Firebase security rules.";
  }
}


// ---------- SETUP ITEMS ----------

window.addSetupItem = function () {

  const container =
    document.getElementById("setupItems");

  const item =
    document.createElement("div");

  item.className = "item";

  item.innerHTML = `
    <input class="setupLabel"
           type="text"
           placeholder="Label (e.g. Student Number)">

    <input class="setupValue"
           type="text"
           placeholder="Information">

    <button class="removeButton">
      Remove
    </button>
  `;

  item
    .querySelector(".removeButton")
    .addEventListener("click", () => {
      item.remove();
    });

  container.appendChild(item);
};


// ---------- BASE64 HELPERS ----------

function bytesToBase64(bytes) {

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}


function base64ToBytes(base64) {

  const binary = atob(base64);

  return Uint8Array.from(
    binary,
    character => character.charCodeAt(0)
  );
}


// ---------- ENCRYPTION ----------

async function deriveKey(password, salt) {

  const encoder = new TextEncoder();

  const material =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 310000,
      hash: "SHA-256"
    },
    material,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}


async function encryptData(data, password) {

  const encoder = new TextEncoder();

  const salt =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const key =
    await deriveKey(password, salt);

  const encrypted =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      encoder.encode(
        JSON.stringify(data)
      )
    );

  return {
    version: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext:
      bytesToBase64(
        new Uint8Array(encrypted)
      )
  };
}


async function decryptData(payload, password) {

  const salt =
    base64ToBytes(payload.salt);

  const iv =
    base64ToBytes(payload.iv);

  const ciphertext =
    base64ToBytes(payload.ciphertext);

  const key =
    await deriveKey(password, salt);

  const decrypted =
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      ciphertext
    );

  return JSON.parse(
    new TextDecoder().decode(decrypted)
  );
}


// ---------- CREATE VAULT ----------

window.createVault = async function () {

  const password =
    document.getElementById("setupPassword").value;

  const confirm =
    document.getElementById("confirmPassword").value;

  const message =
    document.getElementById("setupMessage");

  if (password.length < 10) {

    message.textContent =
      "Please use a vault password of at least 10 characters.";

    return;
  }

  if (password !== confirm) {

    message.textContent =
      "The vault passwords don't match.";

    return;
  }

  const labels =
    document.querySelectorAll(".setupLabel");

  const values =
    document.querySelectorAll(".setupValue");

  const data = [];

  for (let i = 0; i < labels.length; i++) {

    const label =
      labels[i].value.trim();

    const value =
      values[i].value;

    if (label || value) {

      data.push({
        label,
        value
      });
    }
  }

  try {

    message.textContent =
      "Encrypting...";

    const encrypted =
      await encryptData(
        data,
        password
      );

    await setDoc(
      getVaultReference(),
      encrypted
    );

    clearSetupFields();

    currentPassword = "";
    vaultData = [];

    message.textContent = "";

    showScreen("lockedScreen");

  } catch (error) {

    console.error(error);

    message.textContent =
      "Couldn't create the vault.";
  }
};


function clearSetupFields() {

  document
    .querySelectorAll(".setupValue")
    .forEach(input => {
      input.value = "";
    });

  document.getElementById("setupPassword").value = "";
  document.getElementById("confirmPassword").value = "";
}


// ---------- UNLOCK ----------

window.unlockVault = async function () {

  const password =
    document.getElementById("unlockPassword").value;

  const message =
    document.getElementById("unlockMessage");

  if (!password) {

    message.textContent =
      "Enter your vault password.";

    return;
  }

  try {

    message.textContent =
      "Unlocking...";

    const snapshot =
      await getDoc(getVaultReference());

    if (!snapshot.exists()) {

      message.textContent =
        "No vault was found.";

      return;
    }

    vaultData =
      await decryptData(
        snapshot.data(),
        password
      );

    currentPassword = password;

    document.getElementById("unlockPassword").value = "";

    message.textContent = "";

    renderVault();

    showScreen("vaultScreen");

  } catch (error) {

    console.error(error);

    document.getElementById("unlockPassword").value = "";

    message.textContent =
      "Incorrect vault password.";
  }
};


window.unlockOnEnter = function (event) {

  if (event.key === "Enter") {
    unlockVault();
  }
};


// ---------- RENDER VAULT ----------

function renderVault() {

  const container =
    document.getElementById("vaultItems");

  container.innerHTML = "";

  vaultData.forEach(entry => {

    createEditableItem(
      entry.label,
      entry.value
    );

  });
}


function createEditableItem(
  label = "",
  value = ""
) {

  const container =
    document.getElementById("vaultItems");

  const item =
    document.createElement("div");

  item.className = "item";


  const labelInput =
    document.createElement("input");

  labelInput.type = "text";
  labelInput.value = label;
  labelInput.placeholder = "Label";


  const valueRow =
    document.createElement("div");

  valueRow.className = "valueRow";


  const valueInput =
    document.createElement("input");

  valueInput.type = "text";
  valueInput.value = value;
  valueInput.placeholder = "Information";


  const copyButton =
    document.createElement("button");

  copyButton.className = "copyButton";
  copyButton.type = "button";
  copyButton.textContent = "📋";
  copyButton.title = "Copy";

  copyButton.addEventListener(
    "click",
    async () => {

      try {

        await navigator.clipboard.writeText(
          valueInput.value
        );

        copyButton.textContent = "✓";

        setTimeout(() => {
          copyButton.textContent = "📋";
        }, 900);

      } catch {

        valueInput.select();

        document.execCommand("copy");

        copyButton.textContent = "✓";

        setTimeout(() => {
          copyButton.textContent = "📋";
        }, 900);
      }
    }
  );


  valueRow.appendChild(valueInput);
  valueRow.appendChild(copyButton);


  const removeButton =
    document.createElement("button");

  removeButton.className = "removeButton";
  removeButton.type = "button";
  removeButton.textContent = "Remove";

  removeButton.addEventListener(
    "click",
    () => item.remove()
  );


  item.appendChild(labelInput);
  item.appendChild(valueRow);
  item.appendChild(removeButton);

  container.appendChild(item);
}


window.addVaultItem = function () {
  createEditableItem();
};


// ---------- SAVE ----------

window.saveVault = async function () {

  const message =
    document.getElementById("vaultMessage");

  if (!currentPassword) {

    lockVault();
    return;
  }

  const items =
    document.querySelectorAll(
      "#vaultItems .item"
    );

  const updated = [];

  items.forEach(item => {

    const inputs =
      item.querySelectorAll("input");

    const label =
      inputs[0].value.trim();

    const value =
      inputs[1].value;

    if (label || value) {

      updated.push({
        label,
        value
      });
    }
  });

  try {

    message.textContent =
      "Saving encrypted changes...";

    const encrypted =
      await encryptData(
        updated,
        currentPassword
      );

    await setDoc(
      getVaultReference(),
      encrypted
    );

    vaultData = updated;

    message.textContent =
      "Saved ✓";

    setTimeout(() => {

      if (
        document.getElementById("vaultMessage")
          .textContent === "Saved ✓"
      ) {
        document.getElementById("vaultMessage")
          .textContent = "";
      }

    }, 1800);

  } catch (error) {

    console.error(error);

    message.textContent =
      "Couldn't save changes.";
  }
};


// ---------- LOCK ----------

window.lockVault = function () {

  currentPassword = "";

  vaultData = [];

  document.getElementById("vaultItems").innerHTML = "";

  document.getElementById("vaultMessage").textContent = "";

  document.getElementById("unlockPassword").value = "";
  document.getElementById("unlockMessage").textContent = "";

  showScreen("lockedScreen");
};
