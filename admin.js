const STORAGE_KEY = "mbi-admin-users-v1";
const roles = ["Administrator", "Manager", "Member", "Viewer"];
const seedUsers = [
    { id: "u-1001", name: "Aarav Patel", email: "aarav.patel@mitalbrass.com", role: "Administrator", status: "active", team: "Operations", lastActive: "Just now", initials: "AP" },
    { id: "u-1002", name: "Diya Shah", email: "diya.shah@mitalbrass.com", role: "Manager", status: "active", team: "Production", lastActive: "12 min ago", initials: "DS" },
    { id: "u-1003", name: "Kabir Desai", email: "kabir.desai@mitalbrass.com", role: "Member", status: "active", team: "Quality", lastActive: "1 hour ago", initials: "KD" },
    { id: "u-1004", name: "Mira Joshi", email: "mira.joshi@mitalbrass.com", role: "Member", status: "invited", team: "Sales", lastActive: "Not yet", initials: "MJ" },
    { id: "u-1005", name: "Ishaan Mehta", email: "ishaan.mehta@mitalbrass.com", role: "Viewer", status: "active", team: "Finance", lastActive: "Yesterday", initials: "IM" },
    { id: "u-1006", name: "Anaya Trivedi", email: "anaya.trivedi@mitalbrass.com", role: "Manager", status: "suspended", team: "Production", lastActive: "Sep 24, 2026", initials: "AT" },
    { id: "u-1007", name: "Vivaan Bhatt", email: "vivaan.bhatt@mitalbrass.com", role: "Member", status: "active", team: "Procurement", lastActive: "Sep 30, 2026", initials: "VB" },
    { id: "u-1008", name: "Sara Vora", email: "sara.vora@mitalbrass.com", role: "Viewer", status: "invited", team: "Sales", lastActive: "Not yet", initials: "SV" }
];

const elements = {
    tableBody: document.querySelector("#userTableBody"),
    search: document.querySelector("#searchInput"),
    roleFilter: document.querySelector("#roleFilter"),
    statusFilter: document.querySelector("#statusFilter"),
    selectAll: document.querySelector("#selectAllCheckbox"),
    bulkBar: document.querySelector("#bulkBar"),
    selectedCount: document.querySelector("#selectedCount"),
    emptyState: document.querySelector("#emptyState"),
    dialog: document.querySelector("#userDialog"),
    form: document.querySelector("#userForm"),
    toast: document.querySelector("#toast")
};

function loadUsers() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [...seedUsers];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [...seedUsers];
    } catch {
        return [...seedUsers];
    }
}

let users = loadUsers();
let selectedIds = new Set();
let toastTimer;

function saveUsers() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
        return true;
    } catch {
        showToast("Could not save changes in this browser.");
        return false;
    }
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

function initialsFor(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase();
}

function getVisibleUsers() {
    const query = elements.search.value.trim().toLowerCase();
    const role = elements.roleFilter.value;
    const status = elements.statusFilter.value;
    return users.filter(user => {
        const searchable = `${user.name} ${user.email} ${user.team}`.toLowerCase();
        return (!query || searchable.includes(query)) && (!role || user.role === role) && (!status || user.status === status);
    });
}

function render() {
    const visibleUsers = getVisibleUsers();
    const selectedVisible = visibleUsers.filter(user => selectedIds.has(user.id)).length;
    const stats = ["active", "invited", "suspended"];

    document.querySelector("#totalUsers").textContent = users.length;
    document.querySelector("#activeUsers").textContent = users.filter(user => user.status === "active").length;
    document.querySelector("#invitedUsers").textContent = users.filter(user => user.status === "invited").length;
    document.querySelector("#suspendedUsers").textContent = users.filter(user => user.status === "suspended").length;
    document.querySelector("#navUserCount").textContent = users.length;
    document.querySelector("#headingCount").textContent = visibleUsers.length;
    document.querySelector("#resultSummary").textContent = `Showing ${visibleUsers.length} of ${users.length} users`;
    elements.bulkBar.hidden = selectedVisible === 0;
    elements.selectedCount.textContent = `${selectedVisible} selected`;
    elements.selectAll.checked = visibleUsers.length > 0 && selectedVisible === visibleUsers.length;
    elements.selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visibleUsers.length;
    elements.emptyState.hidden = visibleUsers.length > 0;

    elements.tableBody.innerHTML = visibleUsers.map(user => {
        const statusLabel = user.status.charAt(0).toUpperCase() + user.status.slice(1);
        const hue = (user.name.charCodeAt(0) * 11) % 35 + 115;
        return `<tr>
            <td><input class="user-checkbox" type="checkbox" data-id="${escapeHTML(user.id)}" aria-label="Select ${escapeHTML(user.name)}" ${selectedIds.has(user.id) ? "checked" : ""}></td>
            <td><div class="user-cell"><span class="avatar" style="background:hsl(${hue} 30% 91%);color:hsl(${hue} 30% 32%)">${escapeHTML(user.initials || initialsFor(user.name))}</span><span class="user-meta"><strong>${escapeHTML(user.name)}</strong><small>${escapeHTML(user.email)}</small></span></div></td>
            <td><span class="role-label">${escapeHTML(user.role)}</span></td>
            <td><span class="status-pill status-${escapeHTML(user.status)}">${escapeHTML(statusLabel)}</span></td>
            <td>${escapeHTML(user.team)}</td>
            <td>${escapeHTML(user.lastActive || "Not yet")}</td>
            <td><div class="row-actions"><button class="row-action" type="button" data-action="edit" data-id="${escapeHTML(user.id)}" aria-label="Edit ${escapeHTML(user.name)}">Edit</button><button class="row-action delete" type="button" data-action="delete" data-id="${escapeHTML(user.id)}" aria-label="Delete ${escapeHTML(user.name)}">×</button></div></td>
        </tr>`;
    }).join("");
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function openDialog(user) {
    elements.form.reset();
    document.querySelector("#userId").value = user?.id || "";
    document.querySelector("#userName").value = user?.name || "";
    document.querySelector("#userEmail").value = user?.email || "";
    document.querySelector("#userRole").value = user?.role || "Member";
    document.querySelector("#userStatus").value = user?.status || "active";
    document.querySelector("#userTeam").value = user?.team || "";
    document.querySelector("#dialogTitle").textContent = user ? "Edit user" : "Add user";
    document.querySelector("#saveUserButton").textContent = user ? "Save changes" : "Add user";
    elements.dialog.showModal();
    document.querySelector("#userName").focus();
}

function closeDialog() {
    elements.dialog.close();
}

function populateRoleFilter() {
    elements.roleFilter.innerHTML = '<option value="">All roles</option>' + roles.map(role => `<option value="${escapeHTML(role)}">${escapeHTML(role)}</option>`).join("");
}

function exportCSV() {
    const rows = [["Name", "Email", "Role", "Status", "Team", "Last active"], ...getVisibleUsers().map(user => [user.name, user.email, user.role, user.status, user.team, user.lastActive || "Not yet"])];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const file = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mital-user-directory.csv";
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${rows.length - 1} users.`);
}

populateRoleFilter();
document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date());
render();

document.querySelector("#addUserButton").addEventListener("click", () => openDialog());
document.querySelector("#exportButton").addEventListener("click", exportCSV);
document.querySelector("#closeDialogButton").addEventListener("click", closeDialog);
document.querySelector("#cancelDialogButton").addEventListener("click", closeDialog);
elements.search.addEventListener("input", render);
elements.roleFilter.addEventListener("change", render);
elements.statusFilter.addEventListener("change", render);
document.querySelector("#clearFiltersButton").addEventListener("click", () => {
    elements.search.value = "";
    elements.roleFilter.value = "";
    elements.statusFilter.value = "";
    render();
});
document.querySelector("#emptyClearButton").addEventListener("click", () => document.querySelector("#clearFiltersButton").click());

elements.selectAll.addEventListener("change", () => {
    const visibleIds = getVisibleUsers().map(user => user.id);
    if (elements.selectAll.checked) visibleIds.forEach(id => selectedIds.add(id));
    else visibleIds.forEach(id => selectedIds.delete(id));
    render();
});

elements.tableBody.addEventListener("change", event => {
    const checkbox = event.target.closest(".user-checkbox");
    if (!checkbox) return;
    if (checkbox.checked) selectedIds.add(checkbox.dataset.id);
    else selectedIds.delete(checkbox.dataset.id);
    render();
});

elements.tableBody.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const user = users.find(item => item.id === button.dataset.id);
    if (!user) return;
    if (button.dataset.action === "edit") openDialog(user);
    if (button.dataset.action === "delete" && window.confirm(`Delete ${user.name} from this workspace?`)) {
        users = users.filter(item => item.id !== user.id);
        selectedIds.delete(user.id);
        if (saveUsers()) {
            render();
            showToast("User deleted.");
        }
    }
});

document.querySelector("#bulkDeleteButton").addEventListener("click", () => {
    const visibleIds = new Set(getVisibleUsers().map(user => user.id));
    const idsToDelete = [...selectedIds].filter(id => visibleIds.has(id));
    if (!idsToDelete.length || !window.confirm(`Delete ${idsToDelete.length} selected users?`)) return;
    users = users.filter(user => !idsToDelete.includes(user.id));
    idsToDelete.forEach(id => selectedIds.delete(id));
    if (saveUsers()) {
        render();
        showToast(`${idsToDelete.length} users deleted.`);
    }
});

elements.form.addEventListener("submit", event => {
    event.preventDefault();
    const id = document.querySelector("#userId").value;
    const email = document.querySelector("#userEmail").value.trim();
    const duplicate = users.some(user => user.email.toLowerCase() === email.toLowerCase() && user.id !== id);
    if (duplicate) {
        document.querySelector("#userEmail").setCustomValidity("A user with this email already exists.");
        document.querySelector("#userEmail").reportValidity();
        document.querySelector("#userEmail").setCustomValidity("");
        return;
    }

    const priorUser = users.find(user => user.id === id);
    const name = document.querySelector("#userName").value.trim();
    const user = {
        id: id || (crypto.randomUUID ? crypto.randomUUID() : `u-${Date.now()}`),
        name,
        email,
        role: document.querySelector("#userRole").value,
        status: document.querySelector("#userStatus").value,
        team: document.querySelector("#userTeam").value.trim(),
        lastActive: priorUser?.lastActive || "Not yet",
        initials: initialsFor(name)
    };
    if (priorUser) users = users.map(item => item.id === id ? user : item);
    else users = [user, ...users];

    if (saveUsers()) {
        closeDialog();
        render();
        showToast(priorUser ? "User details updated." : "User added.");
    }
});

elements.dialog.addEventListener("click", event => {
    if (event.target === elements.dialog) closeDialog();
});