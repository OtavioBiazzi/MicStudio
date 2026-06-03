import unittest

from micfudiddo.devices import AudioDevice, choose_input_device, choose_virtual_output_device


def device(index, name, hostapi="Windows WASAPI", inputs=0, outputs=0):
    return AudioDevice(
        index=index,
        name=name,
        hostapi=hostapi,
        max_input_channels=inputs,
        max_output_channels=outputs,
        default_samplerate=48000,
    )


class DeviceSelectionTests(unittest.TestCase):
    def test_prefers_fifine_input_on_wasapi(self):
        selected = choose_input_device(
            [
                device(1, "Microfone (fifine Microphone)", "MME", inputs=2),
                device(2, "Microfone (fifine Microphone)", "Windows WASAPI", inputs=2),
            ]
        )
        self.assertIsNotNone(selected)
        self.assertEqual(selected.index, 2)

    def test_picks_real_virtual_cable_output(self):
        selected = choose_virtual_output_device(
            [
                device(1, "Fones de ouvido (Oculus Virtual Audio Device)", outputs=2),
                device(2, "CABLE Input (VB-Audio Virtual Cable)", outputs=2),
            ]
        )
        self.assertIsNotNone(selected)
        self.assertEqual(selected.index, 2)

    def test_does_not_treat_oculus_as_virtual_cable(self):
        selected = choose_virtual_output_device(
            [device(1, "Fones de ouvido (Oculus Virtual Audio Device)", outputs=2)]
        )
        self.assertIsNone(selected)


if __name__ == "__main__":
    unittest.main()
