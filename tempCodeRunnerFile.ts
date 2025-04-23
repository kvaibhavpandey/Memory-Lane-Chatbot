// Memory Lane Chatbot - Now with Notifications

import { useEffect, useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();
const storage = getStorage();

export default function MemoryLane() {
  const [user, setUser] = useState(null);
  const [entry, setEntry] = useState("");
  const [journal, setJournal] = useState([]);
  const [prompt, setPrompt] = useState("Loading prompt...");
  const [voiceBlob, setVoiceBlob] = useState(null);
  const [videoBlob, setVideoBlob] = useState(null);

  useEffect(() => {
    signInAnonymously(auth);
    onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) setUser(currentUser);
    });
  }, []);

  useEffect(() => {
    if (user) {
      fetchPrompt();
      loadJournal();
      requestNotificationPermission();
      scheduleReminder();
    }
  }, [user]);

  const fetchPrompt = async () => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer YOUR_OPENAI_API_KEY`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "system", content: "Generate a reflective journaling prompt." }]
      })
    });
    const data = await response.json();
    setPrompt(data.choices[0].message.content);
  };

  const analyzeSentiment = async (text) => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer YOUR_OPENAI_API_KEY`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "Analyze the sentiment of the following memory and return a single word (positive, negative, or neutral)." },
          { role: "user", content: text }
        ]
      })
    });
    const data = await response.json();
    return data.choices[0].message.content.trim();
  };

  const loadJournal = async () => {
    const q = query(collection(db, `users/${user.uid}/entries`), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    const loaded = querySnapshot.docs.map(doc => doc.data());
    setJournal(loaded);
  };

  const handleSave = async () => {
    if (entry.trim() || voiceBlob || videoBlob) {
      const sentiment = entry ? await analyzeSentiment(entry) : null;
      const data = { text: entry, timestamp: new Date().toISOString(), sentiment };

      if (voiceBlob) {
        const voiceRef = ref(storage, `users/${user.uid}/voice-${Date.now()}.webm`);
        await uploadBytes(voiceRef, voiceBlob);
        data.voiceUrl = await getDownloadURL(voiceRef);
      }

      if (videoBlob) {
        const videoRef = ref(storage, `users/${user.uid}/video-${Date.now()}.webm`);
        await uploadBytes(videoRef, videoBlob);
        data.videoUrl = await getDownloadURL(videoRef);
      }

      await addDoc(collection(db, `users/${user.uid}/entries`), data);
      setEntry("");
      setVoiceBlob(null);
      setVideoBlob(null);
      loadJournal();
    }
  };

  const recordMedia = async (type) => {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video"
    });
    const mediaRecorder = new MediaRecorder(mediaStream);
    const chunks = [];

    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: type === "video" ? "video/webm" : "audio/webm" });
      type === "video" ? setVideoBlob(blob) : setVoiceBlob(blob);
    };

    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), 5000);
  };

  const requestNotificationPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
      });
    }
  };

  const scheduleReminder = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setTimeout(() => {
        new Notification('Memory Lane Reminder', {
          body: 'Don’t forget to write about your day!'
        });
      }, 10000); // fires after 10 seconds for demo
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Memory Lane</h1>

      <Card className="mb-4">
        <CardContent>
          <p className="mb-2 text-lg font-medium">Prompt:</p>
          <p className="italic mb-4">{prompt}</p>
          <Textarea
            placeholder="Write your memory here..."
            className="mb-4"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
          />
          <div className="flex flex-col md:flex-row gap-2 mb-4">
            <Button onClick={() => recordMedia("audio")}>Record Voice</Button>
            <Button onClick={() => recordMedia("video")}>Record Video</Button>
          </div>
          <Button onClick={handleSave}>Save Memory</Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-2">Your Journal</h2>
        {journal.map((item, idx) => (
          <Card key={idx} className="mb-3">
            <CardContent>
              <p className="text-sm text-gray-500 mb-1">{new Date(item.timestamp).toLocaleString()}</p>
              {item.sentiment && <p className="text-sm mb-1">Sentiment: <span className="font-semibold">{item.sentiment}</span></p>}
              {item.text && <p>{item.text}</p>}
              {item.voiceUrl && <audio controls src={item.voiceUrl}></audio>}
              {item.videoUrl && <video controls src={item.videoUrl} className="mt-2 w-full"></video>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

