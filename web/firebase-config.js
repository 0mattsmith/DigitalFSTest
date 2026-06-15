// Firebase Web App configuration.
//
// HOW TO USE:
//   1. Copy this file to "firebase-config.js" in the same /web/ folder.
//   2. Fill in the values from your Firebase Web App config — find them in
//      Firebase Console → Project settings → "Your apps" → Web app config.
//   3. Re-run `npm run build:web` and commit. (The build script picks up
//      firebase-config.js if it exists.)
//
// These values are PUBLIC. Firebase Web App config is meant to be embedded
// in client code — security comes from Firestore Security Rules
// (see firestore.rules in the project root for our ruleset).
//
// If this file is missing or any required field is empty, the Firebase
// features (upload, teacher dashboard) are gracefully disabled and the
// app continues to work entirely locally.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyA1Qhf2hLUb07d-J3quMZ8v6py1udiLPaQ",
  authDomain: "dfsq-practice.firebaseapp.com",
  projectId: "dfsq-practice",
  storageBucket: "dfsq-practice.firebasestorage.app",
  messagingSenderId: "549846064716",
  appId: "1:549846064716:web:f206236436e6ec30f51ee9",
  measurementId: "G-88WZJWZXKC"
};
