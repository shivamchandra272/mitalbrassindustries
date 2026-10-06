<?php
declare(strict_types=1);

session_name('mbi_admin_session');
session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Strict',
    'path' => '/',
]);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'");

if (empty($_SESSION['csrf_token'])) $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function body(): array
{
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 1048576) respond(['error' => 'Request is too large.'], 413);
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function database(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $config = require __DIR__ . '/config.php';
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $config['host'],
        $config['port'],
        $config['database']
    );
    $pdo = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    ensureSchema($pdo);
    return $pdo;
}

function ensureSchema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS admins (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(190) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS customers (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(150) NOT NULL,
        email VARCHAR(190) NULL,
        phone VARCHAR(50) NOT NULL UNIQUE,
        company VARCHAR(190) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS enquiries (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        customer_id BIGINT UNSIGNED NOT NULL,
        product_name VARCHAR(190) NULL,
        message TEXT NOT NULL,
        status ENUM('new', 'contacted', 'closed') NOT NULL DEFAULT 'new',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_enquiries_created_at (created_at),
        INDEX idx_enquiries_status (status),
        CONSTRAINT fk_enquiries_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS products (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(190) NOT NULL,
        category VARCHAR(120) NOT NULL,
        sizes VARCHAR(255) NOT NULL DEFAULT '',
        description TEXT NOT NULL,
        image TEXT NULL,
        gallery JSON NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_products_active_category (is_active, category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS company_settings (
        setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS api_rate_limits (
        scope VARCHAR(32) NOT NULL,
        ip_hash CHAR(64) NOT NULL,
        request_count INT UNSIGNED NOT NULL DEFAULT 0,
        window_started_at INT UNSIGNED NOT NULL,
        PRIMARY KEY (scope, ip_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function requireAdmin(bool $mutating = false): void
{
    if (empty($_SESSION['admin_id'])) respond(['error' => 'Please sign in to continue.'], 401);
    if ($mutating) {
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($token) || !hash_equals($_SESSION['csrf_token'] ?? '', $token)) {
            respond(['error' => 'Security token is missing or expired. Refresh the admin page and try again.'], 403);
        }
    }
}

function requestIpHash(): string
{
    return hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
}

function consumeRateLimit(PDO $pdo, string $scope, int $limit, int $windowSeconds): string
{
    $ipHash = requestIpHash();
    $statement = $pdo->prepare('SELECT request_count, window_started_at FROM api_rate_limits WHERE scope=? AND ip_hash=?');
    $statement->execute([$scope, $ipHash]);
    $record = $statement->fetch();
    $now = time();

    if (!$record || $now - (int)$record['window_started_at'] >= $windowSeconds) {
        $statement = $pdo->prepare('INSERT INTO api_rate_limits (scope, ip_hash, request_count, window_started_at) VALUES (?, ?, 1, ?) ON DUPLICATE KEY UPDATE request_count=1, window_started_at=VALUES(window_started_at)');
        $statement->execute([$scope, $ipHash, $now]);
        return $ipHash;
    }

    if ((int)$record['request_count'] >= $limit) {
        header('Retry-After: ' . max(1, $windowSeconds - ($now - (int)$record['window_started_at'])));
        respond(['error' => 'Too many requests. Please wait before trying again.'], 429);
    }

    $statement = $pdo->prepare('UPDATE api_rate_limits SET request_count=request_count+1 WHERE scope=? AND ip_hash=?');
    $statement->execute([$scope, $ipHash]);
    return $ipHash;
}

function isLocalRequest(): bool
{
    return in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
}

function settingMap(PDO $pdo): array
{
    $rows = $pdo->query('SELECT setting_key, setting_value FROM company_settings')->fetchAll();
    $settings = [];
    foreach ($rows as $row) $settings[$row['setting_key']] = $row['setting_value'];
    return $settings;
}

function importProducts(PDO $pdo, array $products): int
{
    if ((int)$pdo->query('SELECT COUNT(*) FROM products')->fetchColumn() !== 0) return 0;
    $statement = $pdo->prepare('INSERT INTO products (name, category, sizes, description, image, gallery) VALUES (?, ?, ?, ?, ?, ?)');
    $inserted = 0;
    foreach ($products as $product) {
        if (!is_array($product)) continue;
        $name = trim((string)($product['name'] ?? ''));
        $category = trim((string)($product['category'] ?? ''));
        $description = trim((string)($product['description'] ?? ''));
        if ($name === '' || $category === '' || $description === '') continue;
        $gallery = is_array($product['gallery'] ?? null) ? array_values(array_filter($product['gallery'], 'is_string')) : [];
        $statement->execute([
            $name,
            $category,
            trim((string)($product['sizes'] ?? '')),
            $description,
            trim((string)($product['image'] ?? '')),
            json_encode($gallery),
        ]);
        $inserted++;
    }
    return $inserted;
}

try {
    $pdo = database();
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($action === 'health' && $method === 'GET') {
        respond(['ok' => true, 'database' => (require __DIR__ . '/config.php')['database']]);
    }

    if ($action === 'setup-status' && $method === 'GET') {
        $count = (int)$pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn();
        respond(['needs_setup' => $count === 0]);
    }

    if ($action === 'setup-admin' && $method === 'POST') {
        if (!isLocalRequest()) respond(['error' => 'Initial administrator setup is only available from this computer.'], 403);
        consumeRateLimit($pdo, 'admin-setup', 3, 900);
        if ((int)$pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn() !== 0) {
            respond(['error' => 'Admin setup is already complete.'], 409);
        }
        $input = body();
        $name = trim((string)($input['name'] ?? ''));
        $email = strtolower(trim((string)($input['email'] ?? '')));
        $password = (string)($input['password'] ?? '');
        if ($name === '' || strlen($name) > 100 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190 || strlen($password) < 12 || strlen($password) > 255) {
            respond(['error' => 'Enter a name, valid email, and password with at least 12 characters.'], 422);
        }
        $statement = $pdo->prepare('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)');
        $statement->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
        $adminId = (int)$pdo->lastInsertId();
        $imported = importProducts($pdo, is_array($input['products'] ?? null) ? $input['products'] : []);
        session_regenerate_id(true);
        $_SESSION['admin_id'] = $adminId;
        $_SESSION['admin_name'] = $name;
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        respond(['admin' => ['id' => $adminId, 'name' => $name, 'email' => $email], 'csrf_token' => $_SESSION['csrf_token'], 'imported_products' => $imported]);
    }

    if ($action === 'login' && $method === 'POST') {
        $ipHash = consumeRateLimit($pdo, 'admin-login', 5, 900);
        $input = body();
        $email = strtolower(trim((string)($input['email'] ?? '')));
        $statement = $pdo->prepare('SELECT id, name, email, password_hash FROM admins WHERE email = ?');
        $statement->execute([$email]);
        $admin = $statement->fetch();
        if (!$admin || !password_verify((string)($input['password'] ?? ''), $admin['password_hash'])) {
            respond(['error' => 'Email or password is incorrect.'], 401);
        }
        $statement = $pdo->prepare("DELETE FROM api_rate_limits WHERE scope='admin-login' AND ip_hash=?");
        $statement->execute([$ipHash]);
        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int)$admin['id'];
        $_SESSION['admin_name'] = $admin['name'];
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        respond(['admin' => ['id' => (int)$admin['id'], 'name' => $admin['name'], 'email' => $admin['email']], 'csrf_token' => $_SESSION['csrf_token']]);
    }

    if ($action === 'logout' && $method === 'POST') {
        requireAdmin(true);
        $cookie = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $cookie['path'],
            'domain' => $cookie['domain'],
            'secure' => $cookie['secure'],
            'httponly' => $cookie['httponly'],
            'samesite' => 'Strict',
        ]);
        $_SESSION = [];
        session_destroy();
        respond(['ok' => true]);
    }

    if ($action === 'session' && $method === 'GET') {
        if (empty($_SESSION['admin_id'])) respond(['admin' => null]);
        $statement = $pdo->prepare('SELECT id, name, email FROM admins WHERE id = ?');
        $statement->execute([$_SESSION['admin_id']]);
        $admin = $statement->fetch();
        if (!$admin) {
            $_SESSION = [];
            respond(['admin' => null]);
        }
        respond(['admin' => $admin, 'csrf_token' => $_SESSION['csrf_token']]);
    }

    if ($action === 'products' && $method === 'GET') {
        $manage = ($_GET['manage'] ?? '') === '1';
        if ($manage) requireAdmin();
        $where = $manage ? '' : 'WHERE is_active = 1';
        $rows = $pdo->query("SELECT id, name, category, sizes, description, image, gallery, is_active FROM products $where ORDER BY id DESC")->fetchAll();
        foreach ($rows as &$row) $row['gallery'] = $row['gallery'] ? json_decode($row['gallery'], true) : [];
        foreach ($rows as &$row) $row['is_active'] = (bool)$row['is_active'];
        unset($row);
        respond(['products' => $rows]);
    }

    if ($action === 'import-products' && $method === 'POST') {
        requireAdmin(true);
        $input = body();
        $imported = importProducts($pdo, is_array($input['products'] ?? null) ? $input['products'] : []);
        respond(['imported' => $imported]);
    }

    if ($action === 'products' && $method === 'POST') {
        requireAdmin(true);
        $input = body();
        $name = trim((string)($input['name'] ?? ''));
        $category = trim((string)($input['category'] ?? ''));
        $description = trim((string)($input['description'] ?? ''));
        if ($name === '' || $category === '' || $description === '') respond(['error' => 'Name, category, and description are required.'], 422);
        $values = [
            $name,
            $category,
            trim((string)($input['sizes'] ?? '')),
            $description,
            trim((string)($input['image'] ?? '')),
            json_encode(array_values(array_filter($input['gallery'] ?? [], 'is_string'))),
        ];
        if (!empty($input['id'])) {
            $statement = $pdo->prepare('UPDATE products SET name=?, category=?, sizes=?, description=?, image=?, gallery=?, is_active=? WHERE id=?');
            $statement->execute([...$values, !empty($input['is_active']) ? 1 : 0, (int)$input['id']]);
            respond(['id' => (int)$input['id']]);
        }
        $statement = $pdo->prepare('INSERT INTO products (name, category, sizes, description, image, gallery) VALUES (?, ?, ?, ?, ?, ?)');
        $statement->execute($values);
        respond(['id' => (int)$pdo->lastInsertId()], 201);
    }

    if ($action === 'products' && $method === 'DELETE') {
        requireAdmin(true);
        $input = body();
        $statement = $pdo->prepare('UPDATE products SET is_active=0 WHERE id=?');
        $statement->execute([(int)($input['id'] ?? 0)]);
        respond(['ok' => true]);
    }

    if ($action === 'enquiries' && $method === 'POST') {
        consumeRateLimit($pdo, 'public-enquiry', 10, 3600);
        $input = body();
        $name = trim((string)($input['name'] ?? ''));
        $phone = trim((string)($input['phone'] ?? ''));
        $email = trim((string)($input['email'] ?? ''));
        $company = trim((string)($input['company'] ?? ''));
        $message = trim((string)($input['message'] ?? ''));
        $product = trim((string)($input['product'] ?? ''));
        if ($name === '' || strlen($name) > 150 || $phone === '' || strlen($phone) > 50 || strlen($company) > 190 || strlen($email) > 190 || strlen($message) > 5000 || strlen($product) > 190 || ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL))) {
            respond(['error' => 'Enter your name, phone, message, and a valid email address if provided.'], 422);
        }
        $statement = $pdo->prepare('INSERT INTO customers (full_name, email, phone, company) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), email=VALUES(email), company=VALUES(company)');
        $statement->execute([$name, $email ?: null, $phone, $company ?: null]);
        $statement = $pdo->prepare('SELECT id FROM customers WHERE phone = ?');
        $statement->execute([$phone]);
        $customerId = (int)$statement->fetchColumn();
        $statement = $pdo->prepare('INSERT INTO enquiries (customer_id, product_name, message) VALUES (?, ?, ?)');
        $statement->execute([$customerId, $product ?: null, $message]);
        respond(['ok' => true, 'enquiry_id' => (int)$pdo->lastInsertId()], 201);
    }

    if ($action === 'enquiries' && $method === 'GET') {
        requireAdmin();
        $rows = $pdo->query('SELECT e.id, e.product_name, e.message, e.status, e.created_at, c.full_name, c.email, c.phone, c.company FROM enquiries e JOIN customers c ON c.id=e.customer_id ORDER BY e.created_at DESC')->fetchAll();
        respond(['enquiries' => $rows]);
    }

    if ($action === 'enquiry-status' && $method === 'PATCH') {
        requireAdmin(true);
        $input = body();
        $status = (string)($input['status'] ?? '');
        if (!in_array($status, ['new', 'contacted', 'closed'], true)) respond(['error' => 'Invalid enquiry status.'], 422);
        $statement = $pdo->prepare('UPDATE enquiries SET status=? WHERE id=?');
        $statement->execute([$status, (int)($input['id'] ?? 0)]);
        respond(['ok' => true]);
    }

    if ($action === 'customers' && $method === 'GET') {
        requireAdmin();
        $rows = $pdo->query('SELECT c.id, c.full_name, c.email, c.phone, c.company, c.created_at, COUNT(e.id) AS enquiry_count FROM customers c LEFT JOIN enquiries e ON e.customer_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC')->fetchAll();
        respond(['customers' => $rows]);
    }

    if ($action === 'settings' && $method === 'GET') respond(['settings' => settingMap($pdo)]);

    if ($action === 'settings' && $method === 'PUT') {
        requireAdmin(true);
        $allowed = ['company_name', 'phone', 'email', 'city', 'description', 'whatsapp'];
        $statement = $pdo->prepare('INSERT INTO company_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
        foreach (body() as $key => $value) {
            if (in_array($key, $allowed, true) && is_scalar($value)) $statement->execute([$key, trim((string)$value)]);
        }
        respond(['settings' => settingMap($pdo)]);
    }

    respond(['error' => 'Unknown API action.'], 404);
} catch (Throwable $error) {
    error_log($error->__toString());
    respond(['error' => 'The database service is unavailable. Check the PHP server and database configuration.'], 503);
}