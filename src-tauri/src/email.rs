use crate::error::{AppError, AppResult};
use lettre::message::{Mailbox, Message, MessageBuilder};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Tokio1Executor};

/// Gmail App Password thường copy dạng `abcd efgh ijkl mnop` — SMTP cần 16 ký tự không khoảng trắng.
pub fn normalize_gmail_app_password(raw: &str) -> String {
    raw.chars().filter(|ch| !ch.is_whitespace()).collect()
}

/// Tách danh sách email theo `,` `;` hoặc xuống dòng.
pub fn parse_email_list(raw: &str) -> AppResult<Vec<String>> {
    let mut emails = Vec::new();
    for part in raw.split(|ch: char| ch == ',' || ch == ';' || ch == '\n') {
        let email = part.trim();
        if email.is_empty() {
            continue;
        }
        if !email.contains('@') || email.len() < 5 {
            return Err(AppError::Message(format!("Email không hợp lệ: {email}")));
        }
        emails.push(email.to_string());
    }
    Ok(emails)
}

fn parse_mailboxes(raw: &str, field_label: &str) -> AppResult<Vec<Mailbox>> {
    let emails = parse_email_list(raw)?;
    let mut mailboxes = Vec::with_capacity(emails.len());
    for email in emails {
        let mailbox: Mailbox = email.parse().map_err(|err| {
            AppError::Message(format!("{field_label} không hợp lệ (`{email}`): {err}"))
        })?;
        mailboxes.push(mailbox);
    }
    Ok(mailboxes)
}

pub async fn send_report_email(
    from: &str,
    app_password: &str,
    to: &str,
    cc: Option<&str>,
    bcc: Option<&str>,
    subject: &str,
    body: &str,
) -> AppResult<()> {
    let from = from.trim();
    let password = normalize_gmail_app_password(app_password);

    if from.is_empty() {
        return Err(AppError::Message("Chưa cấu hình Gmail gửi.".into()));
    }
    if password.is_empty() {
        return Err(AppError::Message(
            "Chưa cấu hình Gmail App Password. Vào Settings → tạo App Password rồi dán vào.".into(),
        ));
    }
    if password.len() != 16 {
        return Err(AppError::Message(format!(
            "Gmail App Password không hợp lệ (sau khi bỏ khoảng trắng còn {} ký tự, cần đúng 16). Hãy tạo lại tại https://myaccount.google.com/apppasswords rồi dán vào Settings.",
            password.len()
        )));
    }

    let from_mailbox: Mailbox = from
        .parse()
        .map_err(|err| AppError::Message(format!("Email gửi không hợp lệ: {err}")))?;
    let to_mailboxes = parse_mailboxes(to, "Email nhận (To)")?;
    if to_mailboxes.is_empty() {
        return Err(AppError::Message(
            "Chưa cấu hình email nhận báo cáo (To). Có thể nhập nhiều email, cách nhau bằng dấu phẩy."
                .into(),
        ));
    }
    let cc_mailboxes = match cc.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => parse_mailboxes(value, "Cc")?,
        None => Vec::new(),
    };
    let bcc_mailboxes = match bcc.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => parse_mailboxes(value, "Bcc")?,
        None => Vec::new(),
    };

    let mut builder: MessageBuilder = Message::builder().from(from_mailbox);
    for mailbox in to_mailboxes {
        builder = builder.to(mailbox);
    }
    for mailbox in cc_mailboxes {
        builder = builder.cc(mailbox);
    }
    for mailbox in bcc_mailboxes {
        builder = builder.bcc(mailbox);
    }

    let email = builder
        .subject(subject)
        .body(body.to_string())
        .map_err(|err| AppError::Message(format!("Không tạo được email: {err}")))?;

    let creds = Credentials::new(from.to_string(), password);
    let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay("smtp.gmail.com")
        .map_err(|err| AppError::Message(format!("Không khởi tạo được Gmail SMTP: {err}")))?
        .credentials(creds)
        .port(587)
        .build();

    mailer.send(email).await.map_err(|err| {
        let raw = err.to_string();
        if raw.contains("535")
            || raw.contains("BadCredentials")
            || raw.contains("Username and Password not accepted")
        {
            AppError::Message(
                "Gửi mail thất bại: Gmail từ chối mật khẩu (535 BadCredentials).\n\
• Dùng App Password 16 ký tự (không phải mật khẩu đăng nhập Gmail)\n\
• Bật 2-Step Verification trước khi tạo App Password\n\
• Ô “Gmail gửi” phải đúng tài khoản đã tạo App Password\n\
• Vào Settings → dán lại App Password mới → Lưu cấu hình\n\
Tạo tại: https://myaccount.google.com/apppasswords"
                    .into(),
            )
        } else {
            AppError::Message(format!("Gửi mail thất bại: {raw}"))
        }
    })?;

    Ok(())
}
