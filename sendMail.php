<?php
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $name = htmlspecialchars($_POST["Name"]);
    $surname = htmlspecialchars($_POST["Surname"]);
    $email = htmlspecialchars($_POST["Email"]);
    $question = htmlspecialchars($_POST["Question"]);

    $to = "general@owltech.live";
    $subject = "Order from site";
    $headers = "From: no-reply@yourdomain.com\r\n";
    $headers .= "Reply-To: $email\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";

    $message = "
        <html>
        <head>
          <title>Order from site</title>
        </head>
        <body>
          <h2>Данные формы:</h2>
          <p><strong>Имя:</strong> $name</p>
          <p><strong>Фамилия:</strong> $surname</p>
          <p><strong>Email:</strong> $email</p>
          <p><strong>Вопрос:</strong> $question</p>
        </body>
        </html>
    ";

    if (mail($to, $subject, $message, $headers)) {
        echo "success";
    } else {
        echo "error";
    }
} else {
    http_response_code(405);
    echo "Метод не разрешен";
}