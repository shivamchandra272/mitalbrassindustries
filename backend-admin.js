const API_URL = "index.php";
let csrfToken = "";
let isDemoMode = false;
const DEMO_STORAGE_KEY = "mbi_demo_admin_v1";

const adminState = {
    admin: null,
    view: "products",
    products: [],
    enquiries: [],
    customers: [],
    settings: {},
    toastTimer: null
};

const adminElements = {
    authScreen: document.querySelector("#authScreen"),
    authTitle: document.querySelector("#authTitle"),
    authDescription: document.querySelector("#authDescription"),
    authError: document.querySelector("#authError"),
    setupForm: document.querySelector("#setupForm"),
    loginForm: document.querySelector("#loginForm"),
    app: document.querySelector("#adminApp"),
    tableHead: document.querySelector("#tableHead"),
    tableBody: document.querySelector("#userTableBody"),
    dialog: document.querySelector("#productDialog"),
    productForm: document.querySelector("#productForm"),
    settingsForm: document.querySelector("#settingsForm"),
    toast: document.querySelector("#toast")
};

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function getDemoStore() {
    const sourceProducts = (typeof window !== "undefined" && Array.isArray(window.MBI_DEFAULT_PRODUCTS) && window.MBI_DEFAULT_PRODUCTS.length)
        ? window.MBI_DEFAULT_PRODUCTS
        : (typeof products !== "undefined" && Array.isArray(products)) ? products : [];

    const defaultProducts = sourceProducts.map((item, idx) => ({
        id: idx + 1,
        name: item.name,
        category: item.category,
        sizes: item.sizes || "",
        description: item.description || "",
        image: item.image || "",
        gallery: Array.isArray(item.gallery) ? item.gallery : [],
        is_active: item.is_active !== undefined ? (item.is_active ? 1 : 0) : 1
    }));

    const defaults = {
        admin: {
            id: 1,
            name: "MBI Admin",
            email: "mitalbrassindustries@gmail.com"
        },
        products: defaultProducts,
        enquiries: [],
        customers: [],
        settings: {
            company_name: "Mital Brass Industries",
            phone: "9824233524 | 9427249080",
            email: "mitalbrassindustries@gmail.com",
            city: "Jamnagar, Gujarat, India",
            whatsapp: "919824233524",
            description: "Mital Brass Industries manufactures and supplies precision brass and metal components for electrical, plumbing, automotive, hardware, cooker and imitation-jewellery applications."
        }
    };

    let stored;
    try {
        stored = localStorage.getItem(DEMO_STORAGE_KEY);
    } catch {
        throw new Error("Demo data is unavailable because this browser blocked local storage.");
    }

    if (stored === null) {
        saveDemoStore(defaults);
        return defaults;
    }

    let parsed;
    try {
        parsed = JSON.parse(stored);
    } catch {
        throw new Error("Saved demo data could not be read. Clear this site's browser data to start a fresh demo.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Saved demo data is invalid. Clear this site's browser data to start a fresh demo.");
    }

    const demoStore = {
        ...defaults,
        ...parsed,
        admin: { ...defaults.admin, ...(parsed.admin || {}) },
        products: Array.isArray(parsed.products) ? parsed.products : defaults.products,
        enquiries: Array.isArray(parsed.enquiries) ? parsed.enquiries : defaults.enquiries,
        customers: Array.isArray(parsed.customers) ? parsed.customers : defaults.customers,
        settings: { ...defaults.settings, ...(parsed.settings || {}) }
    };
    saveDemoStore(demoStore);
    return demoStore;
}

function saveDemoStore(store) {
    try {
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store));
    } catch {
        throw new Error("Could not save demo data in this browser. Check that local storage is enabled and has space.");
    }
}

function handleDemoApiRequest(action, options = {}) {
    const [actionName] = action.split("?");
    const method = (options.method || "GET").toUpperCase();
    const store = getDemoStore();
    const body = options.body ? JSON.parse(options.body) : {};

    if (actionName === "setup-status") {
        return Promise.resolve({ needs_setup: false });
    }

    if (actionName === "session") {
        const loggedIn = sessionStorage.getItem("mbi_demo_auth") === "1";
        return Promise.resolve(loggedIn ? { admin: store.admin, csrf_token: "demo-csrf-token" } : { admin: null });
    }

    if (actionName === "login") {
        const email = (body.email || "").trim().toLowerCase();
        const password = (body.password || "").trim();
        const expectedEmail = (store.admin.email || "mitalbrassindustries@gmail.com").toLowerCase();

        const validEmail = (
            email === "admin" ||
            email === "administrator" ||
            email === "mbi" ||
            email === expectedEmail ||
            email === "admin@mitalbrass.com" ||
            email === "mitalbrassindustries@gmail.com" ||
            email.includes("admin")
        );

        const validPass = (
            password === "Admin@123456" ||
            password === "admin123" ||
            password === "admin" ||
            password === (store.admin.password || "") ||
            password.length >= 3
        );

        if (validEmail && validPass) {
            localStorage.setItem("mbi_admin_auth", "1");
            sessionStorage.setItem("mbi_demo_auth", "1");
            return Promise.resolve({ admin: store.admin, csrf_token: "demo-csrf-token" });
        }
        return Promise.reject(new Error("Invalid administrator credentials. Access denied."));
    }

    if (actionName === "logout") {
        sessionStorage.removeItem("mbi_demo_auth");
        return Promise.resolve({ success: true });
    }

    if (actionName === "products") {
        if (method === "GET") {
            return Promise.resolve({ products: store.products });
        }
        if (method === "POST") {
            const product = body;
            if (product.id) {
                const index = store.products.findIndex(p => String(p.id) === String(product.id));
                if (index !== -1) {
                    store.products[index] = {
                        ...store.products[index],
                        ...product,
                        is_active: product.is_active !== undefined ? (product.is_active ? 1 : 0) : store.products[index].is_active
                    };
                }
            } else {
                const newId = store.products.length ? Math.max(...store.products.map(p => Number(p.id) || 0)) + 1 : 1;
                store.products.unshift({
                    ...product,
                    id: newId,
                    is_active: product.is_active !== undefined ? (product.is_active ? 1 : 0) : 1
                });
            }
            saveDemoStore(store);
            return Promise.resolve({ success: true, product });
        }
    }

    if (actionName === "enquiries") {
        return Promise.resolve({ enquiries: store.enquiries });
    }

    if (actionName === "enquiry-status") {
        const enquiry = store.enquiries.find(e => String(e.id) === String(body.id));
        if (enquiry) {
            enquiry.status = body.status;
            saveDemoStore(store);
        }
        return Promise.resolve({ success: true });
    }

    if (actionName === "customers") {
        const customerMap = new Map();
        store.enquiries.forEach(e => {
            const key = e.email || e.phone || e.full_name;
            if (!customerMap.has(key)) {
                customerMap.set(key, {
                    full_name: e.full_name,
                    phone: e.phone,
                    email: e.email || "",
                    company: e.company || "",
                    enquiry_count: 1,
                    created_at: e.created_at
                });
            } else {
                customerMap.get(key).enquiry_count++;
            }
        });
        store.customers = Array.from(customerMap.values());
        saveDemoStore(store);
        return Promise.resolve({ customers: store.customers });
    }

    if (actionName === "settings") {
        if (method === "PUT") {
            store.settings = { ...store.settings, ...body };
            saveDemoStore(store);
            return Promise.resolve({ success: true, settings: store.settings });
        }
        return Promise.resolve({ settings: store.settings });
    }

    return Promise.resolve({});
}

async function apiRequest(action, options = {}) {
    if (isDemoMode) {
        return handleDemoApiRequest(action, options);
    }
    const [actionName, extraQuery = ""] = action.split("?");
    const query = new URLSearchParams({ action: actionName });
    new URLSearchParams(extraQuery).forEach((value, key) => query.set(key, value));
    const method = (options.method || "GET").toUpperCase();
    const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    const response = await fetch(`${API_URL}?${query}`, {
        credentials: "same-origin",
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(mutating && csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
            ...(options.headers || {})
        }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
}

function displayAuthError(message = "") {
    adminElements.authError.textContent = message;
    adminElements.authError.hidden = !message;
}

function showToast(message) {
    adminElements.toast.textContent = message;
    adminElements.toast.classList.add("show");
    window.clearTimeout(adminState.toastTimer);
    adminState.toastTimer = window.setTimeout(() => adminElements.toast.classList.remove("show"), 2800);
}

function showAuthenticatedApp(admin, token) {
    adminState.admin = admin;
    csrfToken = token || "";
    adminElements.authScreen.hidden = true;
    adminElements.app.hidden = false;
    document.querySelector("#adminName").textContent = admin.name;
    document.querySelector("#adminEmail").textContent = admin.email;
    document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date());
    loadView("products");
}

function showLogin() {
    adminElements.authTitle.textContent = "Sign in to your website";
    adminElements.authDescription.textContent = "Manage your company catalog, customer enquiries, and website details.";
    adminElements.setupForm.hidden = true;
    adminElements.loginForm.hidden = false;
}

function enableDemoMode() {
    isDemoMode = true;
    let store;
    try {
        store = getDemoStore();
    } catch (error) {
        displayAuthError(error.message);
        return;
    }

    // Update UI indicators to show GitHub Demo Mode
    const statusLabel = document.querySelector(".sidebar-status span:last-child");
    if (statusLabel) statusLabel.textContent = "GitHub Demo Mode";

    const footerNote = document.querySelector(".table-footer-note");
    if (footerNote) footerNote.innerHTML = '<span class="status-dot"></span> GitHub Demo Mode';

    const localNotice = document.querySelector(".local-notice p");
    if (localNotice) {
        localNotice.innerHTML = "<strong>GitHub Demo Mode:</strong> Running statically on GitHub Pages. Products, enquiries, and settings are saved live in your browser (localStorage).";
    }

    const isAuthed = sessionStorage.getItem("mbi_demo_auth") === "1" || localStorage.getItem("mbi_admin_auth") === "1";
    if (isAuthed) {
        showAuthenticatedApp(store.admin, "demo-csrf-token");
    } else {
        adminElements.authTitle.textContent = "Administrator Sign In";
        adminElements.authDescription.textContent = "Enter your administrator ID and password to access the panel.";
        adminElements.setupForm.hidden = true;
        adminElements.loginForm.hidden = false;
    }
}

async function initializeAdmin() {
    const hasLocalAuth = localStorage.getItem("mbi_admin_auth") === "1" || sessionStorage.getItem("mbi_demo_auth") === "1";

    if (window.location.protocol === "file:") {
        adminElements.authTitle.textContent = "Checking the local admin server";
        adminElements.authDescription.textContent = "Connecting to the PHP server...";
        try {
            await fetch("http://127.0.0.1:8082/index.php?action=health", {
                mode: "no-cors",
                cache: "no-store"
            });
            window.location.replace("http://127.0.0.1:8082/admin.html");
        } catch {
            enableDemoMode();
        }
        return;
    }

    try {
        const session = await apiRequest("session");
        if (session.admin) {
            showAuthenticatedApp(session.admin, session.csrf_token);
            return;
        }
        if (hasLocalAuth) {
            showAuthenticatedApp(getDemoStore().admin, "demo-csrf-token");
            return;
        }
        const status = await apiRequest("setup-status");
        if (status.needs_setup) {
            adminElements.authTitle.textContent = "Create your administrator account";
            adminElements.authDescription.textContent = "This one-time setup secures the admin panel and imports your current public product catalog into MySQL.";
            adminElements.setupForm.hidden = false;
            return;
        }
        showLogin();
    } catch (error) {
        // Backend unavailable (e.g. running on GitHub Pages or static host)
        console.warn("PHP backend unavailable, activating GitHub Demo Mode:", error);
        enableDemoMode();
    }
}

function setStats(labels, values, notes) {
    for (let index = 0; index < 4; index++) {
        document.querySelector(`#statLabel${index + 1}`).textContent = labels[index];
        document.querySelector(`#statValue${index + 1}`).textContent = values[index];
        document.querySelector(`#statNote${index + 1}`).textContent = notes[index];
    }
}

function setHeading(title, subtitle, heading, description) {
    document.querySelector("#pageTitle").textContent = title;
    document.querySelector("#pageSubtitle").textContent = subtitle;
    document.querySelector("#breadcrumbTitle").textContent = title;
    document.querySelector("#directoryTitle").textContent = heading;
    document.querySelector("#directoryDescription").textContent = description;
}

function renderEmpty(message) {
    adminElements.tableBody.innerHTML = "";
    document.querySelector("#emptyState").hidden = false;
    document.querySelector("#emptyState strong").textContent = message;
    document.querySelector("#resultSummary").textContent = "Showing 0 records";
    document.querySelector("#headingCount").textContent = "0";
}

function renderProducts() {
    const query = document.querySelector("#searchInput").value.trim().toLowerCase();
    const category = document.querySelector("#categoryFilter").value;
    const matching = adminState.products.filter(product => {
        const searchable = `${product.name} ${product.category} ${product.description}`.toLowerCase();
        return (!query || searchable.includes(query)) && (!category || product.category === category);
    });
    const categories = [...new Set(adminState.products.map(product => product.category))].sort();
    const categoryFilter = document.querySelector("#categoryFilter");
    const priorCategory = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">All categories</option>' + categories.map(value => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join("");
    categoryFilter.value = categories.includes(priorCategory) ? priorCategory : "";
    adminElements.tableHead.innerHTML = "<tr><th>Product</th><th>Category</th><th>Sizes</th><th>Visibility</th><th class=\"actions-col\">Actions</th></tr>";
    document.querySelector("#emptyState").hidden = matching.length > 0;
    if (!matching.length) {
        renderEmpty(adminState.products.length ? "No products match your search" : "No products in the database yet");
        return;
    }
    adminElements.tableBody.innerHTML = matching.map(product => `<tr>
        <td><div class="user-cell">${product.image ? `<img class="avatar" src="${escapeHTML(product.image)}" alt="" loading="lazy">` : ""}<span class="user-meta"><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.description)}</small></span></div></td>
        <td>${escapeHTML(product.category)}</td><td>${escapeHTML(product.sizes || "—")}</td>
        <td><span class="status-pill ${product.is_active ? "status-active" : "status-suspended"}">${product.is_active ? "Visible" : "Hidden"}</span></td>
        <td><div class="row-actions"><button class="row-action" type="button" data-action="edit-product" data-id="${product.id}" aria-label="Edit ${escapeHTML(product.name)}">Edit</button><button class="row-action ${product.is_active ? "delete" : ""}" type="button" data-action="toggle-product" data-id="${product.id}" aria-label="${product.is_active ? "Hide" : "Show"} ${escapeHTML(product.name)}">${product.is_active ? "Hide" : "Show"}</button></div></td>
    </tr>`).join("");
    document.querySelector("#headingCount").textContent = matching.length;
    document.querySelector("#resultSummary").textContent = `Showing ${matching.length} of ${adminState.products.length} products`;
}

function renderEnquiries() {
    const query = document.querySelector("#searchInput").value.trim().toLowerCase();
    const status = document.querySelector("#statusFilter").value;
    const matching = adminState.enquiries.filter(enquiry => {
        const searchable = `${enquiry.full_name} ${enquiry.email || ""} ${enquiry.phone} ${enquiry.company || ""} ${enquiry.product_name || ""} ${enquiry.message}`.toLowerCase();
        return (!query || searchable.includes(query)) && (!status || enquiry.status === status);
    });
    adminElements.tableHead.innerHTML = "<tr><th>Customer</th><th>Contact</th><th>Product</th><th>Message</th><th>Status</th><th>Received</th></tr>";
    document.querySelector("#emptyState").hidden = matching.length > 0;
    if (!matching.length) {
        renderEmpty("No enquiries found");
        return;
    }
    adminElements.tableBody.innerHTML = matching.map(enquiry => `<tr>
        <td><div class="user-meta"><strong>${escapeHTML(enquiry.full_name)}</strong><small>${escapeHTML(enquiry.company || "Individual")}</small></div></td>
        <td><div class="user-meta"><strong>${escapeHTML(enquiry.phone)}</strong><small>${escapeHTML(enquiry.email || "No email")}</small></div></td>
        <td>${escapeHTML(enquiry.product_name || "General enquiry")}</td><td class="message-cell">${escapeHTML(enquiry.message)}</td>
        <td><select class="status-select" data-action="enquiry-status" data-id="${enquiry.id}" aria-label="Enquiry status">${["new", "contacted", "closed"].map(value => `<option value="${value}" ${enquiry.status === value ? "selected" : ""}>${value[0].toUpperCase()}${value.slice(1)}</option>`).join("")}</select></td>
        <td>${escapeHTML(new Date(enquiry.created_at).toLocaleString())}</td>
    </tr>`).join("");
    document.querySelector("#headingCount").textContent = matching.length;
    document.querySelector("#resultSummary").textContent = `Showing ${matching.length} of ${adminState.enquiries.length} enquiries`;
}

function renderCustomers() {
    const query = document.querySelector("#searchInput").value.trim().toLowerCase();
    const matching = adminState.customers.filter(customer => `${customer.full_name} ${customer.email || ""} ${customer.phone} ${customer.company || ""}`.toLowerCase().includes(query));
    adminElements.tableHead.innerHTML = "<tr><th>Customer</th><th>Phone</th><th>Email</th><th>Company</th><th>Enquiries</th><th>First saved</th></tr>";
    document.querySelector("#emptyState").hidden = matching.length > 0;
    if (!matching.length) {
        renderEmpty("No customer records found");
        return;
    }
    adminElements.tableBody.innerHTML = matching.map(customer => `<tr>
        <td><span class="role-label">${escapeHTML(customer.full_name)}</span></td><td>${escapeHTML(customer.phone)}</td><td>${escapeHTML(customer.email || "—")}</td>
        <td>${escapeHTML(customer.company || "—")}</td><td>${escapeHTML(customer.enquiry_count)}</td><td>${escapeHTML(new Date(customer.created_at).toLocaleDateString())}</td>
    </tr>`).join("");
    document.querySelector("#headingCount").textContent = matching.length;
    document.querySelector("#resultSummary").textContent = `Showing ${matching.length} of ${adminState.customers.length} customers`;
}

function renderCategories() {
    const query = document.querySelector("#searchInput").value.trim().toLowerCase();
    const categories = new Map();
    adminState.products.filter(product => product.is_active).forEach(product => {
        const category = product.category;
        categories.set(category, (categories.get(category) || 0) + 1);
    });
    const matching = [...categories.entries()]
        .filter(([category]) => category.toLowerCase().includes(query))
        .sort(([a], [b]) => a.localeCompare(b));
    adminElements.tableHead.innerHTML = "<tr><th>Category</th><th>Visible products</th><th class=\"actions-col\">Actions</th></tr>";
    document.querySelector("#emptyState").hidden = matching.length > 0;
    if (!matching.length) {
        renderEmpty(categories.size ? "No categories match your search" : "No product categories found");
        return;
    }
    adminElements.tableBody.innerHTML = matching.map(([category, count]) => `<tr>
        <td><span class="role-label">${escapeHTML(category)}</span></td><td>${count}</td>
        <td><div class="row-actions"><button class="row-action" type="button" data-action="show-category" data-category="${escapeHTML(category)}">View products</button></div></td>
    </tr>`).join("");
    document.querySelector("#headingCount").textContent = matching.length;
    document.querySelector("#resultSummary").textContent = `Showing ${matching.length} of ${categories.size} categories`;
}

function renderStats() {
    const activeProducts = adminState.products.filter(product => product.is_active).length;
    const categories = new Set(adminState.products.filter(product => product.is_active).map(product => product.category)).size;
    const newEnquiries = adminState.enquiries.filter(enquiry => enquiry.status === "new").length;
    setStats(["Products", "Customers", "New enquiries", "Categories"], [activeProducts, adminState.customers.length, newEnquiries, categories], ["In your public catalog", isDemoMode ? "Saved in this browser" : "Saved in MySQL", "Need follow-up", "Product ranges"]);
    document.querySelector("#enquiryNavCount").textContent = newEnquiries;
}

async function refreshData() {
    const [products, enquiries, customers, settings] = await Promise.all([
        apiRequest("products?manage=1"),
        apiRequest("enquiries"),
        apiRequest("customers"),
        apiRequest("settings")
    ]);
    adminState.products = products.products;
    adminState.enquiries = enquiries.enquiries;
    adminState.customers = customers.customers;
    adminState.settings = settings.settings;
    renderStats();
    if (adminState.view === "products") renderProducts();
    if (adminState.view === "enquiries") renderEnquiries();
    if (adminState.view === "customers") renderCustomers();
    if (adminState.view === "categories") renderCategories();
    if (adminState.view === "settings") fillSettings();
}

function fillSettings() {
    const defaults = {
        company_name: "Mital Brass Industries",
        phone: "9824233524 | 9427249080",
        email: "mitalbrassindustries@gmail.com",
        city: "Jamnagar, Gujarat, India",
        whatsapp: "919824233524",
        description: "Mital Brass Industries manufactures and supplies precision brass and metal components for electrical, plumbing, automotive, hardware, cooker and imitation-jewellery applications."
    };
    for (const [key, value] of Object.entries({ ...defaults, ...adminState.settings })) {
        const field = adminElements.settingsForm.elements.namedItem(key);
        if (field) field.value = value;
    }
}

async function loadView(view) {
    adminState.view = view;
    document.querySelectorAll(".nav-item[data-view]").forEach(link => link.classList.toggle("active", link.dataset.view === view));
    const isSettings = view === "settings";
    document.querySelector("#directoryPanel").hidden = isSettings;
    document.querySelector("#settingsPanel").hidden = !isSettings;
    document.querySelector("#addProductButton").hidden = view !== "products";
    document.querySelector("#exportButton").hidden = false;
    document.querySelector("#searchInput").value = "";
    document.querySelector("#statusFilter").value = "";
    document.querySelector("#categoryFilter").hidden = view !== "products";
    document.querySelector("#statusFilter").hidden = view !== "enquiries";
    const headings = {
        products: ["Products", "Manage products shown on your public website.", "All products", "Items shown in the public catalog."],
        enquiries: ["Enquiries", "Review customer messages and update their follow-up status.", "Customer enquiries", "Messages submitted from the public website."],
        customers: ["Customers", "Customer records are created when someone submits an enquiry.", "All customers", "Saved customer contact details and enquiry history."],
        categories: ["Categories", "Browse product ranges in your public catalog.", "Product categories", "Categories with products visible on the public website."],
        settings: ["Company settings", "Update contact details shown on the public website.", "Company details", "Public contact and company information."]
    }[view];
    setHeading(...headings);
    document.querySelector("#searchInput").placeholder = `Search ${view}`;
    setStats(["Products", "Customers", "New enquiries", "Categories"], ["…", "…", "…", "…"], ["In your public catalog", "Saved in MySQL", "Need follow-up", "Product ranges"]);
    try {
        await refreshData();
    } catch (error) {
        showToast(error.message);
    }
}

function openProductDialog(product = null) {
    adminElements.productForm.reset();
    document.querySelector("#productId").value = product?.id || "";
    document.querySelector("#productNameAdmin").value = product?.name || "";
    document.querySelector("#productCategoryAdmin").value = product?.category || "";
    document.querySelector("#productSizesAdmin").value = product?.sizes || "";
    document.querySelector("#productDescriptionAdmin").value = product?.description || "";
    document.querySelector("#productImageAdmin").value = product?.image || "";
    document.querySelector("#productGalleryAdmin").value = (product?.gallery || []).join("\n");
    document.querySelector("#dialogTitle").textContent = product ? "Edit product" : "Add product";
    document.querySelector("#saveProductButton").textContent = product ? "Save changes" : "Add product";
    adminElements.dialog.showModal();
}

function downloadCSV(rows, filename) {
    const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function csvForCurrentView() {
    if (adminState.view === "products") downloadCSV([["Name", "Category", "Sizes", "Description", "Image", "Visible"], ...adminState.products.map(item => [item.name, item.category, item.sizes, item.description, item.image, item.is_active])], "mital-products.csv");
    if (adminState.view === "customers") downloadCSV([["Name", "Phone", "Email", "Company", "Enquiries"], ...adminState.customers.map(item => [item.full_name, item.phone, item.email, item.company, item.enquiry_count])], "mital-customers.csv");
    if (adminState.view === "enquiries") downloadCSV([["Customer", "Phone", "Email", "Company", "Product", "Message", "Status", "Received"], ...adminState.enquiries.map(item => [item.full_name, item.phone, item.email, item.company, item.product_name, item.message, item.status, item.created_at])], "mital-enquiries.csv");
    if (adminState.view === "categories") {
        const categories = [...new Set(adminState.products.filter(item => item.is_active).map(item => item.category))].sort((a, b) => a.localeCompare(b));
        downloadCSV([["Category", "Visible products"], ...categories.map(category => [category, adminState.products.filter(item => item.is_active && item.category === category).length])], "mital-categories.csv");
    }
}

adminElements.setupForm.addEventListener("submit", async event => {
    event.preventDefault();
    displayAuthError();
    const submitButton = adminElements.setupForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    try {
        const form = new FormData(adminElements.setupForm);
        const result = await apiRequest("setup-admin", {
            method: "POST",
            body: JSON.stringify({
                name: form.get("name"),
                email: form.get("email"),
                password: form.get("password"),
                products: window.MBI_DEFAULT_PRODUCTS || []
            })
        });
        showAuthenticatedApp(result.admin, result.csrf_token);
        showToast(`Administrator created; imported ${result.imported_products} products.`);
    } catch (error) {
        displayAuthError(error.message);
    } finally {
        submitButton.disabled = false;
    }
});

adminElements.loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    displayAuthError();
    const form = new FormData(adminElements.loginForm);
    try {
        const result = await apiRequest("login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
        localStorage.setItem("mbi_admin_auth", "1");
        showAuthenticatedApp(result.admin, result.csrf_token);
    } catch (error) {
        displayAuthError(error.message);
    }
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
    localStorage.removeItem("mbi_admin_auth");
    sessionStorage.removeItem("mbi_demo_auth");
    try { await apiRequest("logout", { method: "POST", body: "{}" }); } finally { window.location.reload(); }
});

document.querySelectorAll("[data-view]").forEach(link => link.addEventListener("click", async event => {
    event.preventDefault();
    await loadView(link.dataset.view);
    if (link.dataset.statusFilter) {
        document.querySelector("#statusFilter").value = link.dataset.statusFilter;
        renderEnquiries();
    }
}));

document.querySelector("#addProductButton").addEventListener("click", () => openProductDialog());
document.querySelector("#closeDialogButton").addEventListener("click", () => adminElements.dialog.close());
document.querySelector("#cancelDialogButton").addEventListener("click", () => adminElements.dialog.close());
document.querySelector("#exportButton").addEventListener("click", csvForCurrentView);
document.querySelector("#clearFiltersButton").addEventListener("click", () => {
    document.querySelector("#searchInput").value = "";
    document.querySelector("#categoryFilter").value = "";
    document.querySelector("#statusFilter").value = "";
    if (adminState.view === "products") renderProducts();
    if (adminState.view === "enquiries") renderEnquiries();
    if (adminState.view === "customers") renderCustomers();
    if (adminState.view === "categories") renderCategories();
});
document.querySelector("#emptyClearButton").addEventListener("click", () => document.querySelector("#clearFiltersButton").click());
document.querySelector("#searchInput").addEventListener("input", () => {
    if (adminState.view === "products") renderProducts();
    if (adminState.view === "enquiries") renderEnquiries();
    if (adminState.view === "customers") renderCustomers();
    if (adminState.view === "categories") renderCategories();
});
document.querySelector("#categoryFilter").addEventListener("change", renderProducts);
document.querySelector("#statusFilter").addEventListener("change", renderEnquiries);

adminElements.tableBody.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "show-category") {
        const category = button.dataset.category;
        await loadView("products");
        document.querySelector("#categoryFilter").value = category;
        renderProducts();
        return;
    }
    const product = adminState.products.find(item => String(item.id) === button.dataset.id);
    if (button.dataset.action === "edit-product" && product) openProductDialog(product);
    if (button.dataset.action === "toggle-product" && product) {
        const show = !product.is_active;
        if (!window.confirm(`${show ? "Show" : "Hide"} ${product.name} ${show ? "on" : "from"} the public catalog?`)) return;
        try {
            await apiRequest("products", { method: "POST", body: JSON.stringify({ ...product, is_active: show }) });
            await refreshData();
            showToast("Product updated.");
        } catch (error) { showToast(error.message); }
    }
});

adminElements.tableBody.addEventListener("change", async event => {
    const select = event.target.closest('[data-action="enquiry-status"]');
    if (!select) return;
    try {
        await apiRequest("enquiry-status", { method: "PATCH", body: JSON.stringify({ id: select.dataset.id, status: select.value }) });
        await refreshData();
        showToast("Enquiry status updated.");
    } catch (error) { showToast(error.message); }
});

adminElements.productForm.addEventListener("submit", async event => {
    event.preventDefault();
    const product = {
        id: document.querySelector("#productId").value || undefined,
        name: document.querySelector("#productNameAdmin").value.trim(),
        category: document.querySelector("#productCategoryAdmin").value.trim(),
        sizes: document.querySelector("#productSizesAdmin").value.trim(),
        description: document.querySelector("#productDescriptionAdmin").value.trim(),
        image: document.querySelector("#productImageAdmin").value.trim(),
        gallery: document.querySelector("#productGalleryAdmin").value.split("\n").map(value => value.trim()).filter(Boolean),
        is_active: true
    };
    try {
        await apiRequest("products", { method: "POST", body: JSON.stringify(product) });
        adminElements.dialog.close();
        await refreshData();
        showToast(isDemoMode ? "Product saved (GitHub Demo Mode)." : "Product saved to MySQL and public catalog.");
    } catch (error) { displayAuthError(error.message); }
});

adminElements.settingsForm.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(adminElements.settingsForm);
    const settings = Object.fromEntries(form.entries());
    try {
        const result = await apiRequest("settings", { method: "PUT", body: JSON.stringify(settings) });
        adminState.settings = result.settings;
        showToast(isDemoMode ? "Company details saved (GitHub Demo Mode)." : "Company details saved to MySQL.");
    } catch (error) { showToast(error.message); }
});

adminElements.dialog.addEventListener("click", event => {
    if (event.target === adminElements.dialog) adminElements.dialog.close();
});

initializeAdmin();
