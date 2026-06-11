import express from "express";
import path from "path";
import fs from "fs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../firebase-applet-config.json";

interface PollItem {
  id: string;
  content: string;
  createdBy: string;
  createdAt: string;
  votes: string[]; // Array of unique visitor IDs
}

// Initialize Firebase Admin configuration
if (!getApps().length) {
  let initialized = false;

  // 1. Try environment variable FIREBASE_SERVICE_ACCOUNT (recommended for Vercel production)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      initialized = true;
      console.log("Firebase Admin initialized via FIREBASE_SERVICE_ACCOUNT env var.");
    } catch (err) {
      console.error("Error parsing FIREBASE_SERVICE_ACCOUNT env var:", err);
    }
  }

  // 2. Try individual env variables for client email and private key
  if (!initialized && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    try {
      initializeApp({
        credential: cert({
          projectId: firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        projectId: firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID
      });
      initialized = true;
      console.log("Firebase Admin initialized via individual env vars.");
    } catch (err) {
      console.error("Error initializing Firebase Admin via individual env vars:", err);
    }
  }

  // 3. Try to read local service account file if it exists (for local testing/setup)
  if (!initialized) {
    const serviceAccountFile = "binh-chon-a6f78-firebase-adminsdk-fbsvc-2d5faafa08.json";
    const serviceAccountPath = path.join(process.cwd(), serviceAccountFile);
    if (fs.existsSync(serviceAccountPath)) {
      try {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
        initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id
        });
        initialized = true;
        console.log("Firebase Admin initialized via local service account JSON file.");
      } catch (err) {
        console.error("Error reading local service account file:", err);
      }
    }
  }

  // 4. Fallback to default credentials / project ID only (works on Cloud Run)
  if (!initialized) {
    initializeApp({
      projectId: firebaseConfig.projectId
    });
    console.log("Firebase Admin initialized via project ID fallback.");
  }
}

const firestore = getFirestore();

// Fetch all polls, seeding with original default options if empty
async function getPolls(): Promise<PollItem[]> {
  try {
    const snapshot = await firestore.collection("polls").get();
    if (snapshot.empty) {
      const initialData: PollItem[] = [
        {
          id: "sample-1",
          content: "Tổ chức Teambuilding bãi biển Vũng Tàu cuối tuần",
          createdBy: "system",
          createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          votes: ["sys-user-1", "sys-user-2", "sys-user-3", "sys-user-4", "sys-user-5"]
        },
        {
          id: "sample-2",
          content: "Workshop chia sẻ kinh nghiệm ứng dụng AI trong lập trình",
          createdBy: "system",
          createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
          votes: ["sys-user-2", "sys-user-4", "sys-user-6", "sys-user-7"]
        },
        {
          id: "sample-3",
          content: "Giải chạy marathon nội bộ công ty cự ly 5km",
          createdBy: "system",
          createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
          votes: ["sys-user-1", "sys-user-3"]
        },
        {
          id: "sample-4",
          content: "Thử thách 'Green Office' - Giảm thiểu rác thải nhựa tại văn phòng",
          createdBy: "system",
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          votes: ["sys-user-3", "sys-user-5", "sys-user-7", "sys-user-8", "sys-user-9", "sys-user-10"]
        }
      ];

      const batch = firestore.batch();
      for (const item of initialData) {
        const docRef = firestore.collection("polls").doc(item.id);
        batch.set(docRef, item);
      }
      await batch.commit();
      return initialData;
    }

    const list: PollItem[] = [];
    snapshot.forEach(doc => {
      list.push(doc.data() as PollItem);
    });
    return list;
  } catch (error) {
    console.error("Lỗi khi nạp dữ liệu từ Firestore:", error);
    return [];
  }
}

const app = express();
app.use(express.json());

// API Route: Get all polls from Firestore
app.get("/api/polls", async (req, res) => {
  try {
    const polls = await getPolls();
    res.json(polls);
  } catch (error) {
    res.status(500).json({ error: "Không thể lấy dữ liệu bình chọn từ hệ thống" });
  }
});

// API Route: Create a new proposal item. Duplicate case is validated first.
app.post("/api/polls", async (req, res) => {
  try {
    const { content, visitorId } = req.body;
    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "Nội dung bình chọn không được để trống" });
    }
    if (!visitorId || typeof visitorId !== "string") {
      return res.status(400).json({ error: "Visitor ID không hợp lệ" });
    }

    const polls = await getPolls();

    // Check if topic exists (case-insensitive & trimmed)
    const isDuplicate = polls.some(
      (p) => p.content.trim().toLowerCase() === content.trim().toLowerCase()
    );
    if (isDuplicate) {
      return res.status(400).json({ error: "Chủ đề bình chọn này đã tồn tại!" });
    }

    const newId = Math.random().toString(36).substring(2, 11);
    const newPoll: PollItem = {
      id: newId,
      content: content.trim(),
      createdBy: visitorId,
      createdAt: new Date().toISOString(),
      votes: [visitorId] // Creator votes for their own option automatically
    };

    await firestore.collection("polls").doc(newId).set(newPoll);

    const updatedPolls = await getPolls();
    res.status(201).json(updatedPolls);
  } catch (error) {
    res.status(500).json({ error: "Không thể lưu chủ đề mới vào hệ thống" });
  }
});

// API Route: Vote/Unvote toggle directly in Firestore
app.post("/api/polls/:id/vote", async (req, res) => {
  try {
    const { id } = req.params;
    const { visitorId } = req.body;

    if (!visitorId || typeof visitorId !== "string") {
      return res.status(400).json({ error: "Visitor ID không hợp lệ" });
    }

    const docRef = firestore.collection("polls").doc(id);
    const docVal = await docRef.get();

    if (!docVal.exists) {
      return res.status(404).json({ error: "Không tìm thấy chủ đề bình chọn" });
    }

    const poll = docVal.data() as PollItem;
    const voterIndex = poll.votes.indexOf(visitorId);

    if (voterIndex > -1) {
      // Toggle off - unvote
      poll.votes.splice(voterIndex, 1);
    } else {
      // Toggle on - vote
      poll.votes.push(visitorId);
    }

    await docRef.update({ votes: poll.votes });

    const updatedPolls = await getPolls();
    res.json(updatedPolls);
  } catch (error) {
    res.status(500).json({ error: "Thao tác cập nhật lượt bình chọn thất bại" });
  }
});

// API Route: Delete a poll (only allowed for original creator or authorized admin/passcode)
app.delete("/api/polls/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { visitorId, passcode } = req.body;

    if (!visitorId || typeof visitorId !== "string") {
      return res.status(400).json({ error: "Visitor ID không hợp lệ" });
    }

    const docRef = firestore.collection("polls").doc(id);
    const docVal = await docRef.get();

    if (!docVal.exists) {
      return res.status(404).json({ error: "Không tìm thấy chủ đề bình chọn" });
    }

    const poll = docVal.data() as PollItem;
    const isAdmin = passcode && typeof passcode === "string" && passcode.trim() === "123456";

    // If they are not admin (authorized passcode) nor creator/system, deny deletion
    if (!isAdmin && poll.createdBy !== "system" && poll.createdBy !== visitorId) {
      return res.status(403).json({ error: "Chỉ người tạo hoặc Quản trị viên mới có thể xóa chủ đề này" });
    }

    await docRef.delete();

    const updatedPolls = await getPolls();
    res.json(updatedPolls);
  } catch (error) {
    res.status(500).json({ error: "Không thể tiến hành xóa chủ đề" });
  }
});

export default app;
