import io
import unittest
from unittest.mock import Mock, patch

import micfudiddo.backend as backend
from backend_run import SafeWriter


class BackendStartupTests(unittest.TestCase):
    def test_windowed_python_logs_without_console(self):
        log = io.StringIO()
        writer = SafeWriter(None, log)
        writer.write("startup error\n")
        writer.flush()
        self.assertEqual(log.getvalue(), "startup error\n")

    def test_closed_console_does_not_hide_runtime_log(self):
        console, log = io.StringIO(), io.StringIO()
        console.close()
        SafeWriter(console, log).write("device error")
        self.assertEqual(log.getvalue(), "device error")

    def test_initialization_exception_is_logged_and_exits_nonzero(self):
        server, thread = Mock(), Mock()
        stderr = io.StringIO()
        with patch.object(backend, "ThreadingHTTPServer", return_value=server), \
                patch.object(backend.threading, "Thread", return_value=thread), \
                patch.object(backend, "install_microphone_safety_handlers"), \
                patch.object(backend, "AppState", side_effect=RuntimeError("device init failed")), \
                patch.object(backend, "STATE", None), \
                patch.object(backend.sys, "argv", ["backend"]), \
                patch.object(backend.sys, "stderr", stderr), \
                patch.object(backend.os, "_exit", side_effect=SystemExit) as exit_process:
            with self.assertRaises(SystemExit):
                backend.main()
        exit_process.assert_called_once_with(1)
        self.assertIn("device init failed", stderr.getvalue())
        server.shutdown.assert_called_once()
        server.server_close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
