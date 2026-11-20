
 
(() => {
  "use strict";

  const cfg = window.MY_MEDIA_CONFIG || {};
  const $ = id => document.getElementById(id);

  const setupNotice = $("setupNotice");
  const authPanel = $("authPanel");
  const appPanel = $("appPanel");
  const loginBtn = $("loginBtn");
  const signupBtn = $("signupBtn");
  const logoutBtn = $("logoutBtn");
  const authMessage = $("authMessage");
  const uploadMessage = $("uploadMessage");
  const galleryMessage = $("galleryMessage");
  const gallery = $("gallery");
  const albumsList = $("albumsList");
  const albumNameInput = $("albumName");
  const albumMessage = $("albumMessage");

  const BUCKET = "my-media-private";

  let db = null;
  let currentUser = null;
  let selectedAlbumId = null;
  let busy = false;

  const say = (el, message) => {
    if (el) el.textContent = message || "";
  };

  const showAuth = () => {
    currentUser = null;
    selectedAlbumId = null;
    authPanel?.classList.remove("hidden");
    appPanel?.classList.add("hidden");
    logoutBtn?.classList.add("hidden");
    if (gallery) gallery.innerHTML = "";
    if (albumsList) albumsList.innerHTML = "";
  };

  const showApp = async user => {
    if (!user) return;
    currentUser = user;

    authPanel?.classList.add("hidden");
    appPanel?.classList.remove("hidden");
    logoutBtn?.classList.remove("hidden");

    if ($("userEmail")) {
      $("userEmail").textContent = user.email || "";
    }

    await loadAlbums();
    await loadGallery();
  };

  const configured =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_KEY &&
    !cfg.SUPABASE_URL.includes("PASTE_") &&
    !cfg.SUPABASE_KEY.includes("PASTE_");

  if (!configured || !window.supabase) {
    setupNotice?.classList.remove("hidden");
    say(authMessage, "Supabase URL සහ Key පරීක්ෂා කරන්න.");
    if (loginBtn) loginBtn.disabled = true;
    if (signupBtn) signupBtn.disabled = true;
    return;
  }

  db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_KEY
  );

  async function loadAlbums() {
    if (!currentUser) return;

    const { data, error } = await db
      .from("albums")
      .select("id,name")
      .order("created_at", { ascending: false });

    if (error) {
      say(albumMessage, error.message);
      return;
    }

    albumsList.innerHTML = "";

    const all = document.createElement("button");
    all.textContent = "📁 All Media";
    all.onclick = () => {
      selectedAlbumId = null;
      loadGallery();
    };
    albumsList.appendChild(all);

    (data || []).forEach(album => {
      const button = document.createElement("button");
      button.textContent = "📂 " + album.name;

      button.onclick = () => {
        selectedAlbumId = album.id;
        say(albumMessage, album.name);
        loadGallery();
      };

      albumsList.appendChild(button);
    });
  }

  async function loadGallery() {
    if (!currentUser) return;

    gallery.innerHTML = "";
    say(galleryMessage, "Gallery එක ලබාගනිමින්...");

    let query = db
      .from("media_items")
      .select("id,file_path,file_name,mime_type,created_at,album_id")
      .order("created_at", { ascending: false });

    if (selectedAlbumId) {
      query = query.eq("album_id", selectedAlbumId);
    }

    const { data, error } = await query;

    if (error) {
      say(galleryMessage, error.message);
      return;
    }

    if (!data || data.length === 0) {
      say(galleryMessage, "තවම Photo / Video නැහැ.");
      return;
    }

    say(galleryMessage, "");

    for (const item of data) {
      const { data: signed, error: signError } =
        await db.storage
          .from(BUCKET)
          .createSignedUrl(item.file_path, 3600);

      if (signError) continue;

      const card = document.createElement("article");
      card.className = "item";

      const media = document.createElement(
        item.mime_type?.startsWith("video/") ? "video" : "img"
      );

      media.src = signed.signedUrl;

      if (media.tagName === "VIDEO") {
        media.controls = true;
        media.playsInline = true;
      } else {
        media.alt = item.file_name || "My media";
        media.loading = "lazy";
      }

      const meta = document.createElement("div");
      meta.className = "meta";

      const name = document.createElement("p");
      name.textContent = item.file_name || "Media";

      const del = document.createElement("button");
      del.className = "delete";
      del.textContent = "Delete";

      del.onclick = async () => {
        if (!confirm("මේ ගොනුව Delete කරන්නද?")) return;

        const { error: storageError } = await db.storage
          .from(BUCKET)
          .remove([item.file_path]);

        if (storageError) {
          alert(storageError.message);
          return;
        }

        const { error: rowError } = await db
          .from("media_items")
          .delete()
          .eq("id", item.id);

        if (rowError) {
          alert(rowError.message);
          return;
        }

        loadGallery();
      };

      meta.append(name, del);
      card.append(media, meta);
      gallery.appendChild(card);
    }
  }

  loginBtn?.addEventListener("click", async () => {
    if (busy) return;

    const email = $("email")?.value.trim();
    const password = $("password")?.value;

    if (!email || !password) {
      say(authMessage, "Email සහ Password දෙකම ඇතුළත් කරන්න.");
      return;
    }

    busy = true;
    loginBtn.disabled = true;
    say(authMessage, "Login වෙමින්...");

    try {
      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      say(authMessage, "Login සාර්ථකයි!");
      await showApp(data.user);

    } catch (error) {
      say(authMessage, "Login Error: " + error.message);
    } finally {
      busy = false;
      loginBtn.disabled = false;
    }
  });

  signupBtn?.addEventListener("click", async () => {
    if (busy) return;

    const email = $("email")?.value.trim();
    const password = $("password")?.value;

    if (!email || !password) {
      say(authMessage, "Email සහ Password ඇතුළත් කරන්න.");
      return;
    }

    if (password.length < 6) {
      say(authMessage, "Password එක අවම අකුරු 6ක් විය යුතුයි.");
      return;
    }

    busy = true;
    signupBtn.disabled = true;
    say(authMessage, "Account එක හදමින්...");

    try {
      const { data, error } = await db.auth.signUp({
        email,
        password
      });

      if (error) throw error;

      if (data.session && data.user) {
        await showApp(data.user);
        say(authMessage, "Account එක සාර්ථකව හැදුවා!");
      } else {
        say(authMessage, "Email එකට ආ Verification link එක තහවුරු කරලා Login වෙන්න.");
      }

    } catch (error) {
      say(authMessage, "Signup Error: " + error.message);
    } finally {
      busy = false;
      signupBtn.disabled = false;
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    const { error } = await db.auth.signOut();

    if (error) {
      say(authMessage, error.message);
      return;
    }

    showAuth();
  });

  createAlbumBtn?.addEventListener("click", async () => {
    if (!currentUser) return;

    const name = albumNameInput.value.trim();

    if (!name) {
      say(albumMessage, "Album එකට නමක් දෙන්න.");
      return;
    }

    const { error } = await db.from("albums").insert({
      user_id: currentUser.id,
      name
    });

    if (error) {
      say(albumMessage, error.message);
      return;
    }

    albumNameInput.value = "";
    say(albumMessage, "Album එක හැදුවා!");
    await loadAlbums();
  });

  $("uploadBtn")?.addEventListener("click", async () => {
    if (!currentUser) return;

    const input = $("fileInput");
    const file = input.files?.[0];

    if (!file) {
      say(uploadMessage, "Photo හෝ Video එකක් තෝරන්න.");
      return;
    }

    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) {
      say(uploadMessage, "Image හෝ Video පමණක් තෝරන්න.");
      return;
    }

    if (file.size > 200 * 1024 * 1024) {
      say(uploadMessage, "ගොනුව 200MB ට වඩා වැඩියි.");
      return;
    }

    const ext = (file.name.split(".").pop() || "bin")
      .replace(/[^a-zA-Z0-9]/g, "");

    const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;

    const btn = $("uploadBtn");
    btn.disabled = true;
    say(uploadMessage, "Upload වෙමින්...");

    try {
      const { error } = await db.storage
        .from(BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type
        });

      if (error) throw error;

      const { error: dbError } = await db
        .from("media_items")
        .insert({
          owner_id: currentUser.id,
          file_path: path,
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
          album_id: selectedAlbumId
        });

      if (dbError) {
        await db.storage.from(BUCKET).remove([path]);
        throw dbError;
      }

      input.value = "";
      say(uploadMessage, "Upload සාර්ථකයි!");
      await loadGallery();

    } catch (error) {
      say(uploadMessage, "Upload Error: " + error.message);
    } finally {
      btn.disabled = false;
    }
  });

  $("refreshBtn")?.addEventListener("click", loadGallery);

  async function initialize() {
    say(authMessage, "පරීක්ෂා කරමින්...");

    const { data, error } = await db.auth.getSession();

    if (error) {
      say(authMessage, error.message);
      return;
    }

    if (data.session?.user) {
      await showApp(data.session.user);
    } else {
      showAuth();
      say(authMessage, "");
    }
  }

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      showAuth();
    }
  });

  initialize().catch(error => {
    say(authMessage, "Error: " + error.message);
  });

})();
