from __future__ import annotations

import smtplib
from email.message import EmailMessage


def normalize_gmail_app_password(raw: str) -> str:
    return "".join(ch for ch in raw if not ch.isspace())


def parse_email_list(raw: str) -> list[str]:
    emails: list[str] = []
    for part in raw.replace(";", ",").replace("\n", ",").split(","):
        email = part.strip()
        if not email:
            continue
        if "@" not in email or len(email) < 5:
            raise ValueError(f"Email không hợp lệ: {email}")
        emails.append(email)
    return emails


def send_report_email(
    from_email: str,
    app_password: str,
    to: str,
    subject: str,
    body: str,
    cc: str = "",
    bcc: str = "",
) -> None:
    from_email = from_email.strip()
    password = normalize_gmail_app_password(app_password)

    if not from_email:
        raise ValueError("Chưa cấu hình Gmail gửi.")
    if not password:
        raise ValueError("Chưa cấu hình Gmail App Password.")
    if len(password) != 16:
        raise ValueError(
            f"Gmail App Password không hợp lệ (sau khi bỏ khoảng trắng còn "
            f"{len(password)} ký tự, cần đúng 16). "
            "Tạo lại tại https://myaccount.google.com/apppasswords"
        )

    to_list = parse_email_list(to)
    if not to_list:
        raise ValueError("Chưa cấu hình email nhận báo cáo (To).")

    cc_list = parse_email_list(cc) if cc.strip() else []
    bcc_list = parse_email_list(bcc) if bcc.strip() else []

    message = EmailMessage()
    message["From"] = from_email
    message["To"] = ", ".join(to_list)
    if cc_list:
        message["Cc"] = ", ".join(cc_list)
    message["Subject"] = subject
    message.set_content(body)

    recipients = to_list + cc_list + bcc_list

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(from_email, password)
            smtp.send_message(message, to_addrs=recipients)
    except smtplib.SMTPAuthenticationError as err:
        raise RuntimeError(
            "Gửi mail thất bại: Gmail từ chối mật khẩu (535 BadCredentials).\n"
            "• Dùng App Password 16 ký tự (không phải mật khẩu đăng nhập)\n"
            "• Bật 2-Step Verification trước khi tạo App Password\n"
            "• Ô from phải đúng tài khoản đã tạo App Password\n"
            "Tạo tại: https://myaccount.google.com/apppasswords"
        ) from err
    except smtplib.SMTPException as err:
        raise RuntimeError(f"Gửi mail thất bại: {err}") from err
