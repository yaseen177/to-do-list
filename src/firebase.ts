import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyC0v1NHS7x995fI-j9GspTOd-wTeRhxu6w",
    authDomain: "workflow-2026.firebaseapp.com",
    projectId: "workflow-2026",
    storageBucket: "workflow-2026.firebasestorage.app",
    messagingSenderId: "362728778124",
    appId: "1:362728778124:web:80f9ffa1fab4a427f14ea9",
    measurementId: "G-LY38WZW496"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Configure Google Provider with Calendar Scopes
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events.readonly');