
(() => {
  "use strict";

  const cfg = window.MY_MEDIA_CONFIG || {};
  const $ = id => document.getElementById(id);

  const BUCKET = "my-media-private";

  let db = null;
  let currentUser = null;
  let selectedAlbumId = null;
  let busy = false;

  const say = (id, message) => {
    const el = $(id);
    if (el) el.textContent = message || "";
  };

  function showAuth() {
    currentUser = null;
    selectedAlbumId = null;

    $("authPanel")?.classList.remove("hidden");
    $("appPanel")?.classList.add("hidden");
    $("logoutBtn")?.classList.add("hidden");

    if ($("gallery")) $("gallery").innerHTML = "";
    if ($("albumsList")) $("albumsList").innerHTML = "";
  }

  async function showApp(user) {
    if (!user) return;

    currentUser = user;

    $("authPanel")?.classList.add("hidden");
    $("appPanel")?.classList.remove("hidden");
    $("logoutBtn")?.classList.remove("hidden");

    say("userEmail", user.email);

    await loadAlbums();
    await loadGallery();
  }

  // SUPABASE SETUP

  const configured =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_KEY &&
    !cfg.SUPABASE_URL.includes("PASTE_") &&
    !cfg.SUPABASE_KEY.includes("PASTE_");

  if (!configured || !window.supabase) {
    $("setupNotice")?.classList.remove("hidden");
    say("authMessage", "Supabase URL සහ Key පරීක්ෂා කරන්න.");
    if ($("loginBtn")) $("loginBtn").disabled = true;
    if ($("signupBtn")) $("signupBtn").disabled = true;
    return;
  }

  db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_KEY
  );

  // ALBUMS

  async function loadAlbums() {
    if (!currentUser) return;

    const list = $("albumsList");
    if (!list) return;

    list.innerHTML = "";

    const { data, error } = await db
      .from("albums")
      .select("id,name")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      say("albumMessage", "Album Error: " + error.message);
      return;
    }

    const allBtn = document.createElement("button");
    allBtn.textContent = "📁 All Media";
    allBtn.className = selectedAlbumId === null ? "active" : "";

    allBtn.onclick = () => {
      selectedAlbumId = null;
      loadAlbums();
      loadGallery();
    };

    list.appendChild(allBtn);

    (data || []).forEach(album => {
      const btn = document.createElement("button");

      btn.textContent = "📂 " + album.name;
      btn.className = selectedAlbumId === album.id ? "active" : "";

      btn.onclick = () => {
        selectedAlbumId = album.id;
        loadAlbums();
        loadGallery();
      };

      list.appendChild(btn);
    });

    say("albumMessage", "");
  }

  async function createAlbum() {
    if (!currentUser || busy) return;

    const input = $("albumName");
    const name = input?.value.trim();

    if (!name) {
      say("albumMessage", "Album එකට නමක් දෙන්න.");
      return;
    }

    busy = true;
    $("createAlbumBtn").disabled = true;
    say("albumMessage", "Album එක හදමින්...");

    try {
      const { data, error } = await db
        .from("albums")
        .insert({
          user_id: currentUser.id,
          name: name
        })
        .select("id")
        .single();

      if (error) throw error;

      input.value = "";
      selectedAlbumId = data.id;

      say("albumMessage", "Album එක සාර්ථකව හැදුවා!");

      await loadAlbums();
      await loadGallery();

    } catch (error) {
      say("albumMessage", "Error: " + error.message);
    } finally {
      busy = false;
      $("createAlbumBtn").disabled = false;
    }
  }

  // GALLERY

  async function loadGallery() {
    if (!currentUser) return;

    const gallery = $("gallery");
    if (!gallery) return;

    gallery.innerHTML = "";
    say("galleryMessage", "Gallery එක ලබාගනිමින්...");

    try {
      let query = db
        .from("media_items")
        .select("id,file_path,file_name,mime_type,created_at,album_id")
        .eq("owner_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (selectedAlbumId) {
        query = query.eq("album_id", selectedAlbumId);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (!data || data.length === 0) {
        say("galleryMessage", "තවම Photo / Video නැහැ.");
        return;
      }

      say("galleryMessage", "");

      for (const item of data) {
        const { data: signed, error: signError } =
          await db.storage
            .from(BUCKET)
            .createSignedUrl(item.file_path, 3600);

        if (signError) continue;

        const card = document.createElement("article");
        card.className = "item";

        const isVideo = item.mime_type?.startsWith("video/");

        const media = document.createElement(
          isVideo ? "video" : "img"
        );

        media.src = signed.signedUrl;

        if (isVideo) {
          media.controls = true;
          media.playsInline = true;
        } else {
          media.alt = item.file_name || "My Media";
          media.loading = "lazy";
        }

        const meta = document.createElement("div");
        meta.className = "meta";

        const name = document.createElement("p");
        name.textContent = item.file_name || "Media";

        const del = document.createElement("button");
        del.className = "delete";
        del.textContent = "🗑️ Delete";

        del.onclick = async () => {
          if (!confirm("මේ ගොනුව Delete කරන්නද?")) return;

          del.disabled = true;

          try {
            const { error: storageError } = await db.storage
              .from(BUCKET)
              .remove([item.file_path]);

            if (storageError) throw storageError;

            const { error: rowError } = await db
              .from("media_items")
              .delete()
              .eq("id", item.id)
              .eq("owner_id", currentUser.id);

            if (rowError) throw rowError;

            await loadGallery();

          } catch (error) {
            alert("Delete Error: " + error.message);
            del.disabled = false;
          }
        };

        meta.append(name, del);
        card.append(media, meta);
        gallery.appendChild(card);
      }

    } catch (error) {
      say("galleryMessage", "Gallery Error: " + error.message);
    }
  }

  // LOGIN

  $("loginBtn")?.addEventListener("click", async () => {
    if (busy) return;

    const email = $("email")?.value.trim();
    const password = $("password")?.value;

    if (!email || !password) {
      say("authMessage", "Email සහ Password ඇතුළත් කරන්න.");
      return;
    }

    busy = true;
    $("loginBtn").disabled = true;
    say("authMessage", "Login වෙමින්...");

    try {
      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      await showApp(data.user);
      say("authMessage", "");

    } catch (error) {
      say("authMessage", "Login Error: " + error.message);
    } finally {
      busy = false;
      $("loginBtn").disabled = false;
    }
  });

  // SIGNUP

  $("signupBtn")?.addEventListener("click", async () => {
    if (busy) return;

    const email = $("email")?.value.trim();
    const password = $("password")?.value;

    if (!email || !password) {
      say("authMessage", "Email සහ Password ඇතුළත් කරන්න.");
      return;
    }

    if (password.length < 6) {
      say("authMessage", "Password එක අවම අකුරු 6ක් විය යුතුයි.");
      return;
    }

    busy = true;
    $("signupBtn").disabled = true;
    say("authMessage", "Account එක හදමින්...");

    try {
      const { data, error } = await db.auth.signUp({
        email,
        password
      });

      if (error) throw error;

      if (data.session && data.user) {
        await showApp(data.user);
        say("authMessage", "Account එක හැදුවා!");
      } else {
        say("authMessage", "Email Verification කරලා Login වෙන්න.");
      }

    } catch (error) {
      say("authMessage", "Signup Error: " + error.message);
    } finally {
      busy = false;
      $("signupBtn").disabled = false;
    }
  });

  // LOGOUT

  $("logoutBtn")?.addEventListener("click", async () => {
    const { error } = await db.auth.signOut();

    if (error) {
      say("authMessage", error.message);
      return;
    }

    showAuth();
  });

  // CREATE ALBUM BUTTON

  $("createAlbumBtn")?.addEventListener("click", createAlbum);

  // UPLOAD

  $("uploadBtn")?.addEventListener("click", async () => {
    if (!currentUser || busy) return;

    const input = $("fileInput");
    const file = input?.files?.[0];

    if (!file) {
      say("uploadMessage", "Photo හෝ Video එකක් තෝරන්න.");
      return;
    }

    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) {
      say("uploadMessage", "Image හෝ Video පමණක් තෝරන්න.");
      return;
    }

    if (file.size > 200 * 1024 * 1024) {
      say("uploadMessage", "ගොනුව 200MB ට වඩා වැඩියි.");
      return;
    }

    const ext = (file.name.split(".").pop() || "bin")
      .replace(/[^a-zA-Z0-9]/g, "");

    const path =
      currentUser.id + "/" +
      Date.now() + "-" +
      Math.random().toString(36).slice(2) + "." + ext;

    const btn = $("uploadBtn");

    busy = true;
    btn.disabled = true;
    say("uploadMessage", "Upload වෙමින්...");

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

      say("uploadMessage", "Upload සාර්ථකයි!");

      await loadGallery();

    } catch (error) {
      say("uploadMessage", "Upload Error: " + error.message);
    } finally {
      busy = false;
      btn.disabled = false;
    }
  });

  // REFRESH

  $("refreshBtn")?.addEventListener("click", loadGallery);

  // INITIALIZE

  async function initialize() {
    say("authMessage", "පරීක්ෂා කරමින්...");

    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      await showApp(data.session.user);
    } else {
      showAuth();
      say("authMessage", "");
    }
  }

  db.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      showAuth();
    }
  });

  initialize().catch(error => {
    say("authMessage", "Error: " + error.message);
  });

})();
