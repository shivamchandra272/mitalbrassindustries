<?php
declare(strict_types=1);

return [
    'host' => getenv('MBI_DB_HOST') ?: '127.0.0.1',
    'port' => getenv('MBI_DB_PORT') ?: '3306',
    'database' => getenv('MBI_DB_NAME') ?: 'mitalbrassindustries',
    'username' => getenv('MBI_DB_USER') ?: 'root',
    'password' => getenv('MBI_DB_PASSWORD') !== false ? getenv('MBI_DB_PASSWORD') : '',
];