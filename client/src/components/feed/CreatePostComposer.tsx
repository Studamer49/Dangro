import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import type { Post } from "@/types";

interface CreatePostComposerProps {
  onCreated: (post: Post) => void;
}

const MAX_MEDIA = 10;

export default function CreatePostComposer({ onCreated }: CreatePostComposerProps) {
  const user = useAuthStore((s) => s.user);
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const picked = Array.from(incoming);
    const media = picked.filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
    );
    if (media.length !== picked.length) {
      toast.error("Only image and video files can be attached");
    }
    if (media.length === 0) return;

    const combined = [...files, ...media];
    if (combined.length > MAX_MEDIA) {
      toast.error(`You can attach up to ${MAX_MEDIA} media items per post`);
    }
    setFiles(combined.slice(0, MAX_MEDIA));
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files);
    event.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const publish = async () => {
    if (files.length === 0 || posting) return;
    setPosting(true);
    try {
      const media: Array<{ url: string; type: "image" | "video" }> = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const { data } = await api.post("/uploads", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (data.type !== "image" && data.type !== "video") {
          throw new Error("Only images and videos can be posted");
        }
        media.push({ url: data.url, type: data.type === "video" ? "video" : "image" });
      }

      const trimmed = caption.trim();
      const payload = trimmed ? { caption: trimmed, media } : { media };
      const { data } = await api.post("/posts", payload);
      const post = data.post as Post | undefined;
      if (!post) throw new Error("The post was created but no post data was returned");

      onCreated(post);
      setFiles([]);
      setCaption("");
      toast.success("Post published");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-600 text-sm font-bold">
          {user?.username?.[0]?.toUpperCase() ?? "?"}
        </div>
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={2200}
          rows={2}
          placeholder="Write a caption..."
          aria-label="Post caption"
          className="min-w-0 flex-1 resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
        />
      </div>

      {previews.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {previews.map((src, index) => {
            const file = files[index];
            if (!file) return null;
            return (
              <div
                key={`${src}-${index}`}
                className="relative aspect-square overflow-hidden rounded-lg border border-gray-800 bg-gray-800"
              >
                {file.type.startsWith("video/") ? (
                  <video src={src} muted className="h-full w-full object-cover" />
                ) : (
                  <img src={src} alt={file.name} className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-gray-300 transition-colors hover:text-white"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleInputChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={posting}
          className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add media
          {files.length > 0 && (
            <span className="text-xs text-gray-500">
              ({files.length}/{MAX_MEDIA})
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={posting || files.length === 0}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {posting ? "Posting..." : "Post"}
        </button>
      </div>
    </div>
  );
}
