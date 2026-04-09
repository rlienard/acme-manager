"""
Tests for the EmailNotifier service.
"""

import smtplib
from unittest.mock import MagicMock, patch

import pytest

from app.services.notifier import EmailNotifier


SMTP_CONFIG = {
    "smtp_server": "smtp.example.com",
    "smtp_port": 587,
    "smtp_username": "alerts@example.com",
    "smtp_password": "secret",
    "alert_recipients": ["admin@example.com"],
}


# ---------------------------------------------------------------------------
# __init__
# ---------------------------------------------------------------------------

class TestEmailNotifierInit:
    def test_loads_config_values(self):
        notifier = EmailNotifier(SMTP_CONFIG)
        assert notifier.smtp_server == "smtp.example.com"
        assert notifier.smtp_port == 587
        assert notifier.username == "alerts@example.com"
        assert notifier.password == "secret"
        assert notifier.recipients == ["admin@example.com"]

    def test_defaults_on_empty_config(self):
        notifier = EmailNotifier({})
        assert notifier.smtp_server == ""
        assert notifier.smtp_port == 587
        assert notifier.username == ""
        assert notifier.password == ""
        assert notifier.recipients == []


# ---------------------------------------------------------------------------
# send()
# ---------------------------------------------------------------------------

class TestEmailNotifierSend:
    def test_skips_when_no_smtp_server(self, caplog):
        notifier = EmailNotifier({**SMTP_CONFIG, "smtp_server": ""})
        with patch("smtplib.SMTP") as mock_smtp:
            notifier.send("Test subject", "<p>body</p>")
            mock_smtp.assert_not_called()
        assert "SMTP not configured" in caplog.text

    def test_skips_when_no_recipients(self, caplog):
        notifier = EmailNotifier({**SMTP_CONFIG, "alert_recipients": []})
        with patch("smtplib.SMTP") as mock_smtp:
            notifier.send("Test subject", "<p>body</p>")
            mock_smtp.assert_not_called()
        assert "SMTP not configured" in caplog.text

    def test_sends_email_with_correct_fields(self):
        notifier = EmailNotifier(SMTP_CONFIG)
        mock_server = MagicMock()

        with patch("smtplib.SMTP", return_value=mock_server) as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
            notifier.send("Hello", "<p>World</p>")

        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("alerts@example.com", "secret")
        mock_server.send_message.assert_called_once()

        sent_msg = mock_server.send_message.call_args[0][0]
        assert sent_msg["Subject"] == "[ISE ACME] Hello"
        assert sent_msg["From"] == "alerts@example.com"
        assert sent_msg["To"] == "admin@example.com"

    def test_send_uses_configured_port(self):
        notifier = EmailNotifier({**SMTP_CONFIG, "smtp_port": 465})
        mock_server = MagicMock()

        with patch("smtplib.SMTP", return_value=mock_server) as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
            notifier.send("Subject", "body")

        mock_smtp_cls.assert_called_once_with("smtp.example.com", 465)

    def test_send_multiple_recipients(self):
        config = {**SMTP_CONFIG, "alert_recipients": ["a@x.com", "b@x.com"]}
        notifier = EmailNotifier(config)
        mock_server = MagicMock()

        with patch("smtplib.SMTP", return_value=mock_server) as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
            notifier.send("Subject", "body")

        sent_msg = mock_server.send_message.call_args[0][0]
        assert sent_msg["To"] == "a@x.com, b@x.com"

    def test_smtp_error_is_caught_and_logged(self, caplog):
        notifier = EmailNotifier(SMTP_CONFIG)

        with patch("smtplib.SMTP", side_effect=smtplib.SMTPException("Connection refused")):
            notifier.send("Subject", "body")  # must not raise

        assert "Failed to send email" in caplog.text


# ---------------------------------------------------------------------------
# send_renewal_report()
# ---------------------------------------------------------------------------

class TestSendRenewalReport:
    def _make_notifier(self):
        return EmailNotifier(SMTP_CONFIG)

    def test_all_success_subject(self):
        notifier = self._make_notifier()
        results = {
            "node1": {"status": "ok", "days_remaining": 30},
            "node2": {"status": "renewed"},
        }
        with patch.object(notifier, "send") as mock_send:
            notifier.send_renewal_report(results, "acme.example.com", "shared")
            subject = mock_send.call_args[0][0]
            assert subject == "All Nodes OK"

    def test_partial_failure_subject(self):
        notifier = self._make_notifier()
        results = {
            "node1": {"status": "ok", "days_remaining": 30},
            "node2": {"status": "error", "error": "Timeout"},
        }
        with patch.object(notifier, "send") as mock_send:
            notifier.send_renewal_report(results, "acme.example.com", "shared")
            subject = mock_send.call_args[0][0]
            assert "Failed" in subject

    def test_body_contains_common_name_and_mode(self):
        notifier = self._make_notifier()
        results = {"node1": {"status": "ok", "days_remaining": 10}}
        with patch.object(notifier, "send") as mock_send:
            notifier.send_renewal_report(results, "acme.example.com", "per-node")
            body = mock_send.call_args[0][1]
            assert "acme.example.com" in body
            assert "per-node" in body

    def test_body_contains_node_rows(self):
        notifier = self._make_notifier()
        results = {
            "node-a": {"status": "renewed"},
            "node-b": {"status": "error", "error": "DNS failure"},
        }
        with patch.object(notifier, "send") as mock_send:
            notifier.send_renewal_report(results, "cn", "shared")
            body = mock_send.call_args[0][1]
            assert "node-a" in body
            assert "node-b" in body
            assert "DNS failure" in body

    def test_ok_status_shows_days_remaining(self):
        notifier = self._make_notifier()
        results = {"node1": {"status": "ok", "days_remaining": 45}}
        with patch.object(notifier, "send") as mock_send:
            notifier.send_renewal_report(results, "cn", "shared")
            body = mock_send.call_args[0][1]
            assert "45 days" in body
