import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { config } from "../config.js";

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "video/mp4", "video/webm", "video/quicktime",
      "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm",
      "application/pdf",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed"));
    }
  },
});

router.post("/", authenticate, upload.single("file"), (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: "No file uploaded" });
      return;
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const mimeType = req.file.mimetype;

    let type = "file";
    if (mimeType.startsWith("image/")) type = "image";
    else if (mimeType.startsWith("video/")) type = "video";
    else if (mimeType.startsWith("audio/")) type = "audio";

    res.status(201).json({
      url: fileUrl,
      filename: req.file.originalname,
      size: req.file.size,
      mimeType,
      type,
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
