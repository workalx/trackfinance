import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDp8sqMaW7NwpMvIdEs1YcImIpBt6bRmmg",
  authDomain: "trackfinance-505602.firebaseapp.com",
  projectId: "trackfinance-505602",
  storageBucket: "trackfinance-505602.firebasestorage.app",
  messagingSenderId: "35800296881",
  appId: "1:35800296881:web:bb6ee73629c86458e1a190",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
