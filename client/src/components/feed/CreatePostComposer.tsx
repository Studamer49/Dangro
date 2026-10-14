import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import api from "@/lib/api";
import { uploadErrorMessage, uploadMedia } from "@/lib/upload";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import Avatar from "@/components/Avatar";
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
    const trimmedCaption = caption.trim();
    if (posting || (files.length === 0 && !trimmedCaption)) return;
    setPosting(true);
    try {
      const media: Array<{
        url: string;
        type: "image" | "video";
        width?: number;
        height?: number;
      }> = [];

      // Sequential, not Promise.all: each file is its own request with its own
      // size limit, and uploading ten at once makes a slow connection fail all
      // of them instead of the one that was too big.
      for (const file of files) {
        const uploaded = await uploadMedia(file);
        if (uploaded.type !== "image" && uploaded.type !== "video") {
          throw new Error("Only images and videos can be posted");
        }
        media.push({
          url: uploaded.url,
          type: uploaded.type,
          // Reported by Cloudinary, so the feed can reserve space and avoid a
          // layout jump as each image loads.
          ...(uploaded.width ? { width: uploaded.width } : {}),
          ...(uploaded.height ? { height: uploaded.height } : {}),
        });
      }

      const { data } = await api.post("/posts", {
        caption: trimmedCaption || undefined,
        media,
      });
      const post = data.post as Post | undefined;
      if (!post) throw new Error("The post was created but no post data was returned");

      onCreated(post);
      setFiles([]);
      setCaption("");
      toast.success("Post published");
    } catch (err) {
      toast.error(uploadErrorMessage(err, "Could not publish your post"));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <Avatar user={user} className="h-9 w-9 text-sm" />
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={2200}
          rows={2}
          placeholder="Write a caption..."
          aria-label="Post caption"
          className="field min-w-0 flex-1 resize-none py-2.5"
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
                className="glass relative aspect-square overflow-hidden rounded-xl border shadow-elev1"
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
                  className="glass absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border shadow-elev2 text-gray-300 transition-colors duration-200 ease-out hover:text-white"
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
          className="btn-ghost px-3 py-2 text-sm"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add media
          {files.length > 0 && (
            <span className="tabular text-xs text-gray-500">
              ({files.length}/{MAX_MEDIA})
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={posting || (files.length === 0 && !caption.trim())}
          className="btn-primary px-4 py-2 text-sm"
        >
          {posting ? "Posting..." : "Post"}
        </button>
      </div>
    </div>
  );
}
