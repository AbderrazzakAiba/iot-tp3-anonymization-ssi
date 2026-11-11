"""Smart-lock actuator. Prints to the console by default; on a Raspberry Pi set
TP3_GPIO_PIN=17 (any BCM pin) to drive an LED or relay through gpiozero."""
from __future__ import annotations

import os
import time


class SmartLock:
    def __init__(self, name: str = "front-door", open_seconds: float = 2.0):
        self.name = name
        self.open_seconds = open_seconds
        self._led = None
        pin = os.environ.get("TP3_GPIO_PIN")
        if pin:
            from gpiozero import LED  # only available on the Raspberry Pi
            self._led = LED(int(pin))

    def unlock(self) -> None:
        print(f"    [{self.name}] UNLOCKED")
        if self._led is not None:
            self._led.on()
            time.sleep(self.open_seconds)
            self._led.off()
            print(f"    [{self.name}] locked again")

    def deny(self, reason: str) -> None:
        print(f"    [{self.name}] stays LOCKED - {reason}")
