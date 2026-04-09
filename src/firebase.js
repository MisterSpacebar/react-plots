import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAnejaCo0rikhwbaqwuOnaVi0z1M3G1rSg",
  authDomain: "react-plots.firebaseapp.com",
  projectId: "react-plots",
  storageBucket: "react-plots.firebasestorage.app",
  messagingSenderId: "543057660410",
  appId: "1:543057660410:web:9aac79423ebe4ecfbb3c43",
  measurementId: "G-ZGE46ZJNP3",
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export default app;
