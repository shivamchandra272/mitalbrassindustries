<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this utility from Reset-Admin-Password.bat.\n");
}

$password = getenv('MBI_ADMIN_RESET_PASSWORD');
$clearLockout = ($argv[1] ?? '') === '--clear-login-lockout';
$showAdmins = ($argv[1] ?? '') === '--show-admins';
if (!$clearLockout && !$showAdmins && (!is_string($password) || strlen($password) < 12 || strlen($password) > 255)) {
    fwrite(STDERR, "Password must be between 12 and 255 bytes.\n");
    exit(1);
}

try {
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
    $admins = $pdo->query('SELECT email FROM admins ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
} catch (PDOException $error) {
    fwrite(STDERR, "Could not access the admin database. Check that MySQL is running and config.php is correct.\n");
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}

if ($clearLockout) {
    $statement = $pdo->prepare("DELETE FROM api_rate_limits WHERE scope='admin-login' AND ip_hash IN (?, ?)");
    $statement->execute([
        hash('sha256', '127.0.0.1'),
        hash('sha256', '::1'),
    ]);
    fwrite(STDOUT, "Cleared local admin login lockout. You can try signing in again.\n");
    exit(0);
}

if ($showAdmins) {
    foreach ($admins as $adminEmail) {
        fwrite(STDOUT, $adminEmail . "\n");
    }
    exit($admins ? 0 : 1);
}

if (!$admins) {
    fwrite(STDERR, "No administrator account exists. Open admin.html to create the first account.\n");
    exit(1);
}

if (count($admins) === 1) {
    $email = $admins[0];
} else {
    fwrite(STDOUT, "Admin accounts:\n");
    foreach ($admins as $adminEmail) {
        fwrite(STDOUT, "  $adminEmail\n");
    }
    fwrite(STDOUT, "Enter the email address to reset: ");
    $email = trim((string)fgets(STDIN));
    if (!in_array($email, $admins, true)) {
        fwrite(STDERR, "That email does not match an admin account.\n");
        exit(1);
    }
}

try {
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    if (!is_string($passwordHash)) {
        throw new RuntimeException('Could not create a password hash.');
    }
    $statement = $pdo->prepare('UPDATE admins SET password_hash=? WHERE email=?');
    $statement->execute([$passwordHash, $email]);
    $statement = $pdo->prepare("DELETE FROM api_rate_limits WHERE scope='admin-login' AND ip_hash IN (?, ?)");
    $statement->execute([
        hash('sha256', '127.0.0.1'),
        hash('sha256', '::1'),
    ]);
} catch (Throwable $error) {
    fwrite(STDERR, "Could not update the admin password: " . $error->getMessage() . "\n");
    exit(1);
}

fwrite(STDOUT, "Password reset successfully for $email.\nUse that email address to sign in at http://127.0.0.1:8082/admin.html.\n");
