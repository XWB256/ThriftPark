"use client";

import { useState, useEffect } from "react";
import { Heart, HeartOff } from "lucide-react";

type ForumPost = {
  combo_uuid: string;
  username: string;
  msg_subject: string;
  msg_content: string;
  like_count: number;
  reply_uuid: string;
  edited?: boolean;
};

// Toggle this to true to disable backend calls temporarily
const MOCK_MODE = false;

export default function ForumPage() {
  const storedUser = localStorage.getItem("thriftpark_user");
  //const currentUser = storedUser ? JSON.parse(storedUser).username : ""; //before mock
  const currentUser = storedUser ? JSON.parse(storedUser).username : "Sean"; // fallback

  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // Fetch posts on mount
  useEffect(() => {
    if (MOCK_MODE) {
      console.log("🧩 Running in MOCK MODE — backend calls disabled.");
      setPosts([
        {
          combo_uuid: "1",
          username: "Ben Dover",
          msg_subject: "Why Stadium no parking?",
          msg_content: "is there an event now? why got so many cars?",
          like_count: 2,
          reply_uuid: "",
        },
        {
          combo_uuid: "2",
          username: "Mickey Mouse",
          msg_subject: "How to drive car?",
          msg_content: "Idk how to drive help",
          like_count: 3,
          reply_uuid: "",
        },
        {
          combo_uuid: "3",
          username: "Donald Duck",
          msg_subject: "Try this",
          msg_content: "Maybe reverse your car first 😂",
          like_count: 1,
          reply_uuid: "2",
        },
      ]);
      return;
    }

    const fetchPosts = async () => {
      try {
        const res = await fetch("http://localhost:3003/get-all-posts");
        const data = await res.json();
        setPosts(data);
      } catch (err) {
        console.error("Error fetching posts:", err);
      }
    };
    fetchPosts();
  }, []);

  // --- Add new post ---
  const handleAddPost = async () => {
    if (!subject || !content) return alert("Please fill all fields");

    const newPost: ForumPost = {
      combo_uuid: crypto.randomUUID(),
      username: currentUser,
      msg_subject: subject,
      msg_content: content,
      like_count: 0,
      reply_uuid: "",
    };

    if (MOCK_MODE) {
      setPosts([newPost, ...posts]);
      setSubject("");
      setContent("");
      return;
    }

    try {
      const res = await fetch("http://localhost:3003/new-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPost),
      });

      if (!res.ok) {
        const error = await res.json();
        return alert("Failed to create post: " + error.error);
      }

      setPosts([newPost, ...posts]);
      setSubject("");
      setContent("");
    } catch (err) {
      console.error("Error adding post:", err);
      alert("An error occurred while adding the post.");
    }
  };

  // --- Reply to post ---
  const handleReply = async (parentId: string, text: string) => {
    if (!text.trim()) return;

    const newReply: ForumPost = {
      combo_uuid: crypto.randomUUID(),
      username: currentUser,
      msg_subject: "Reply",
      msg_content: text,
      like_count: 0,
      reply_uuid: parentId,
    };

    if (MOCK_MODE) {
      setPosts((prev) => [...prev, newReply]);
      return;
    }

    try {
      const res = await fetch("http://localhost:3003/reply-to-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newReply),
      });

      if (!res.ok) {
        const error = await res.json();
        return alert("Failed to reply: " + error.error);
      }

      setPosts((prevPosts) => [...prevPosts, newReply]);
    } catch (err) {
      console.error("Error replying to post:", err);
    }
  };

  // --- Like post ---
  const handleLike = async (id: string) => {
    const hasLiked = likedPosts.has(id);

    if (MOCK_MODE) {
      // Local toggle
      setPosts(
        posts.map((p) =>
          p.combo_uuid === id
            ? { ...p, like_count: p.like_count + (hasLiked ? -1 : 1) }
            : p
        )
      );

      // Update local liked state
      setLikedPosts((prev) => {
        const updated = new Set(prev);
        if (hasLiked) updated.delete(id);
        else updated.add(id);
        return updated;
      });
      return;
    }

    try {
      const res = await fetch("http://localhost:3003/like-post", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          combo_uuid: id,
          action: hasLiked ? "unlike" : "like", // optional backend support
          username: currentUser,
        }),
      });

      if (res.ok) {
        setPosts(
          posts.map((p) =>
            p.combo_uuid === id
              ? { ...p, like_count: p.like_count + (hasLiked ? -1 : 1) }
              : p
          )
        );
        setLikedPosts((prev) => {
          const updated = new Set(prev);
          if (hasLiked) updated.delete(id);
          else updated.add(id);
          return updated;
        });
      } else {
        const error = await res.json();
        alert("Failed to like/unlike post: " + error.error);
      }
    } catch (err) {
      console.error("Error liking post:", err);
    }
  };

  // --- Delete post ---
  const handleDelete = async (id: string) => {
    if (MOCK_MODE) {
      setPosts(posts.filter((p) => p.combo_uuid !== id && p.reply_uuid !== id));
      return;
    }

    try {
      const res = await fetch("http://localhost:3003/delete-post", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser, combo_uuid: id }),
      });

      if (res.ok) {
        setPosts(
          posts.filter((p) => p.combo_uuid !== id && p.reply_uuid !== id)
        );
      } else {
        const error = await res.json();
        alert("Failed to delete post: " + error.error);
      }
    } catch (err) {
      console.error("Error deleting post:", err);
    }
  };

  // --- Edit Post ---
  const handleEdit = async (id: string) => {
    const target = posts.find((p) => p.combo_uuid === id);
    if (!target) return;

    // If not currently editing, enter edit mode
    if (editingId !== id) {
      setEditingId(id);
      setEditText(target.msg_content);
      return;
    }

    // Otherwise, save the edit
    if (!editText.trim()) return alert("Content cannot be empty.");

    if (MOCK_MODE) {
      setPosts(
        posts.map((p) =>
          p.combo_uuid === id
            ? { ...p, msg_content: editText, edited: true }
            : p
        )
      );
      setEditingId(null);
      return;
    }

    try {
      const res = await fetch("http://localhost:3003/edit-post", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          combo_uuid: id,
          new_content: editText,
          username: currentUser,
        }),
      });

      if (res.ok) {
        setPosts(
          posts.map((p) =>
            p.combo_uuid === id
              ? { ...p, msg_content: editText, edited: true }
              : p
          )
        );
        setEditingId(null);
      } else {
        const error = await res.json();
        alert("Failed to edit post: " + error.error);
      }
    } catch (err) {
      console.error("Error editing post:", err);
    }
  };

  // --- Recursive replies ---
  const renderReplies = (parentId: string, depth: number = 1) => {
    return posts
      .filter((p) => p.reply_uuid === parentId)
      .map((reply) => (
        <div
          key={reply.combo_uuid}
          style={{
            marginLeft: `${depth * 0.1}rem`,
            borderLeft: "2px solid rgba(34,197,94,0.4)", // subtle green line
            paddingLeft: "1rem",
          }}
          className="relative mt-3"
        >
          {/* Reply Content */}
          <div className="p-2">
            {editingId === reply.combo_uuid ? (
              <div className="mt-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full p-2 rounded bg-white/10 text-white text-sm border border-green-400 focus:ring-1 focus:ring-green-500"
                  rows={2}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleEdit(reply.combo_uuid)}
                    className="bg-green-600 px-3 py-1 rounded text-white hover:bg-green-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="bg-gray-600 px-3 py-1 rounded text-white hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-gray-200 text-sm leading-relaxed">
                  {reply.msg_content}
                  {!!reply.edited && (
                    <span className="text-xs text-gray-400 italic ml-1">
                      (edited)
                    </span>
                  )}
                </p>
              </>
            )}
            <p className="text-gray-400 text-xs mt-1">— {reply.username}</p>
            <div className="flex gap-2 text-xs mt-2">
              <button
                onClick={() => handleLike(reply.combo_uuid)}
                className="flex items-center gap-1 text-sm text-gray-300 hover:text-red-500 transition"
              >
                {likedPosts.has(reply.combo_uuid) ? (
                  <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                ) : (
                  <Heart className="w-5 h-5" />
                )}
                <span>{reply.like_count}</span>
              </button>

              <ReplyBox parentId={reply.combo_uuid} onReply={handleReply} />

              {reply.username === currentUser && (
                <>
                  <button
                    onClick={() => handleEdit(reply.combo_uuid)}
                    className="text-yellow-400 hover:text-yellow-500 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(reply.combo_uuid)}
                    className="text-red-400 hover:text-red-500 text-sm"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Recursive nested replies */}
          {renderReplies(reply.combo_uuid, depth + 1)}
        </div>
      ));
  };

  // --- Render page ---
  return (
    <div className="max-w-5xl mx-auto p-10 text-white">
      <h1 className="text-3xl font-semibold mb-10 text-center text-white">
        Drivers' Forum{" "}
        {MOCK_MODE && (
          <span className="text-yellow-400 text-sm">(Mock Mode)</span>
        )}
      </h1>

      {/* New Post */}
      <div className="border border-white/20 rounded-2xl p-4 mb-6 bg-white/10 backdrop-blur-xl shadow-lg">
        <input
          className="border p-2 w-full mb-2 rounded bg-white/10 text-white placeholder-gray-300 focus:ring-1 focus:ring-green-400"
          placeholder="Post subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <textarea
          className="border p-2 w-full mb-2 rounded bg-white/10 text-white placeholder-gray-300 focus:ring-1 focus:ring-green-400"
          placeholder="Your question..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          onClick={handleAddPost}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
        >
          Post
        </button>
      </div>

      {/* Posts */}
      {posts
        .filter((p) => !p.reply_uuid)
        .map((post) => (
          <div key={post.combo_uuid} className="border-b border-white/20 py-4">
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl shadow-md">
              <h2 className="text-lg font-medium text-green-400">
                {post.msg_subject}
              </h2>
              {editingId === post.combo_uuid ? (
                <div className="mt-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full p-2 rounded bg-white/10 text-white text-sm border border-green-400 focus:ring-1 focus:ring-green-500"
                    rows={2}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleEdit(post.combo_uuid)}
                      className="bg-green-600 px-3 py-1 rounded text-white hover:bg-green-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="bg-gray-600 px-3 py-1 rounded text-white hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-gray-300 mt-1">
                    {post.msg_content}
                    {!!post.edited && (
                      <span className="text-xs text-gray-400 italic ml-1">
                        (edited)
                      </span>
                    )}
                  </p>
                </>
              )}

              <div className="flex items-center gap-4 text-sm mt-2">
                <span>👤 {post.username}</span>
                <button
                  onClick={() => handleLike(post.combo_uuid)}
                  className="flex items-center gap-1 text-sm text-gray-300 hover:text-red-500 transition"
                >
                  {likedPosts.has(post.combo_uuid) ? (
                    <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                  ) : (
                    <Heart className="w-5 h-5" />
                  )}
                  <span>{post.like_count}</span>
                </button>

                <ReplyBox parentId={post.combo_uuid} onReply={handleReply} />
                {post.username === currentUser && (
                  <>
                    <button
                      onClick={() => handleEdit(post.combo_uuid)}
                      className="text-yellow-400 hover:text-yellow-500 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(post.combo_uuid)}
                      className="text-red-400 hover:text-red-500 text-sm"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
            {renderReplies(post.combo_uuid)}
          </div>
        ))}
    </div>
  );
}

function ReplyBox({
  parentId,
  onReply,
}: {
  parentId: string;
  onReply: (id: string, text: string) => void;
}) {
  const [replyText, setReplyText] = useState("");
  const [show, setShow] = useState(false);

  const handleSubmit = () => {
    if (!replyText.trim()) return;
    onReply(parentId, replyText);
    setReplyText("");
    setShow(false);
  };

  return show ? (
    <div className="flex gap-2 mt-2">
      <input
        className="border rounded p-1 text-white w-full"
        placeholder="Reply..."
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
      />
      <button
        onClick={handleSubmit}
        className="bg-green-600 px-2 rounded text-white hover:bg-green-700 transition"
      >
        Post
      </button>
      <button
        onClick={() => setShow(false)}
        className="bg-green-600 px-2 rounded text-white hover:bg-green-700 transition"
      >
        Cancel
      </button>
    </div>
  ) : (
    <button
      onClick={() => setShow(true)}
      className="text-green-400 hover:underline text-sm"
    >
      Reply
    </button>
  );
}
