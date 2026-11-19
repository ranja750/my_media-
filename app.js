(() => {
  const cfg = window.MY_MEDIA_CONFIG || {};
  const setupNotice = document.getElementById("setupNotice");
  const authPanel = document.getElementById("authPanel");
  const appPanel = document.getElementById("appPanel");
  const logoutBtn = document.getElementById("logoutBtn");
  const authMessage = document.getElementById("authMessage");
  const uploadMessage = document.getElementById("uploadMessage");
  const galleryMessage = document.getElementById("galleryMessage");
  const gallery = document.getElementById("gallery");
  const BUCKET = "my-media-private";
  let supabase = null;
  let currentUser = null;

  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_KEY &&
    !cfg.SUPABASE_URL.includes("PASTE_") && !cfg.SUPABASE_KEY.includes("PASTE_");

  if (!configured || !window.supabase) {
    setupNotice.classList.remove("hidden");
    document.getElementById("loginBtn").disabled = true;
    document.getElementById("signupBtn").disabled = true;
    return;
  }
  supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

  const say = (el, msg) => { el.textContent = msg || ""; };
  const showApp = async (user) => {
    currentUser = user;
    authPanel.classList.add("hidden");
    appPanel.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    document.getElementById("userEmail").textContent = user.email || "";
    await loadGallery();
  };
  const showAuth = () => {
    currentUser = null;
    authPanel.classList.remove("hidden");
    appPanel.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    gallery.innerHTML = "";
  };

  document.getElementById("loginBtn").addEventListener("click", async () => {
    say(authMessage, "Login වෙමින්...");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value
    });
    if (error) return say(authMessage, error.message);
    say(authMessage, "");
    await showApp(data.user);
  });

  document.getElementById("signupBtn").addEventListener("click", async () => {
    say(authMessage, "Account එක හදමින්...");
    const { data, error } = await supabase.auth.signUp({
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value
    });
    if (error) return say(authMessage, error.message);
    if (data.session) await showApp(data.user);
    say(authMessage, "Verification email එකක් ආවොත් එය තහවුරු කරලා Login වෙන්න. Account එක සෑදීම සාර්ථකයි.");
  });

  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    showAuth();
  });

  document.getElementById("uploadBtn").addEventListener("click", async () => {
    if (!currentUser) return;
    const input = document.getElementById("fileInput");
    const file = input.files && input.files[0];
    if (!file) return say(uploadMessage, "මුලින් Photo හෝ Video එකක් තෝරන්න.");
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/"))
      return say(uploadMessage, "Image හෝ Video ගොනුවක් පමණක් තෝරන්න.");
    if (file.size > 200 * 1024 * 1024)
      return say(uploadMessage, "ගොනුව 200MB ට වඩා වැඩියි. කුඩා ගොනුවක් තෝරන්න.");
    const ext = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "");
    const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;
    say(uploadMessage, "Upload වෙමින්... ටිකක් ඉන්න.");
    document.getElementById("uploadBtn").disabled = true;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type
    });
    document.getElementById("uploadBtn").disabled = false;
    if (error) return say(uploadMessage, error.message);
    const { error: dbError } = await supabase.from("media_items").insert({
      owner_id: currentUser.id, file_path: path, file_name: file.name,
      mime_type: file.type, file_size: file.size
    });
    if (dbError) {
      await supabase.storage.from(BUCKET).remove([path]);
      return say(uploadMessage, dbError.message);
    }
    input.value = "";
    say(uploadMessage, "Upload සාර්ථකයි!");
    await loadGallery();
  });

  document.getElementById("refreshBtn").addEventListener("click", loadGallery);

  async function loadGallery() {
    if (!currentUser) return;
    gallery.innerHTML = "";
    say(galleryMessage, "Gallery එක ලබාගනිමින්...");
    const { data, error } = await supabase.from("media_items")
      .select("id,file_path,file_name,mime_type,created_at")
      .order("created_at", { ascending: false });
    if (error) return say(galleryMessage, error.message);
    if (!data || !data.length) return say(galleryMessage, "තවම කිසිම Photo / Video එකක් Upload කරලා නැහැ.");
    say(galleryMessage, "");
    for (const item of data) {
      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET).createSignedUrl(item.file_path, 300);
      if (signError) continue;
      const card = document.createElement("article");
      card.className = "item";
      let media;
      if ((item.mime_type || "").startsWith("video/")) {
        media = document.createElement("video");
        media.controls = true;
        media.playsInline = true;
      } else {
        media = document.createElement("img");
        media.alt = item.file_name || "My media";
        media.loading = "lazy";
      }
      media.src = signed.signedUrl;
      const meta = document.createElement("div");
      meta.className = "meta";
      const name = document.createElement("p");
      name.className = "filename";
      name.textContent = item.file_name || "Media";
      const del = document.createElement("button");
      del.className = "delete";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm("මේ ගොනුව Delete කරන්නද?")) return;
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([item.file_path]);
        if (storageError) return alert(storageError.message);
        const { error: rowError } = await supabase.from("media_items").delete().eq("id", item.id);
        if (rowError) return alert(rowError.message);
        await loadGallery();
      });
      meta.append(name, del);
      card.append(media, meta);
      gallery.append(card);
    }
  }

  supabase.auth.getSession().then(({ data }) => {
    if (data.session) showApp(data.session.user);
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session && !currentUser) showApp(session.user);
    if (!session && currentUser) showAuth();
  });
})();
