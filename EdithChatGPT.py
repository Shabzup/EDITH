import os
import time
import requests
from pushbullet import Pushbullet
import speech_recognition as sr
import pyttsx3
from bluetooth import *
import RPi.GPIO as GPIO
from PIL import Image, ImageDraw, ImageFont
import adafruit_ssd1306
import board
import digitalio
import openai

# Constants
PUSHBULLET_API_KEY = ""
PHONE_BLUETOOTH_ADDRESS = ""
EARBUDS_BLUETOOTH_ADDRESS = ""
WIFI_INTERFACE = "wlan0"
OPENAI_API_KEY = ""

# Setup Pushbullet
pb = Pushbullet(PUSHBULLET_API_KEY)

# Setup Text-to-Speech
engine = pyttsx3.init()

# Setup OLED Display (assuming it's a 128x32 display)
i2c = board.I2C()
oled_reset = digitalio.DigitalInOut(board.D4)
WIDTH = 128
HEIGHT = 32
BORDER = 5
oled = adafruit_ssd1306.SSD1306_I2C(WIDTH, HEIGHT, i2c, addr=0x3C, reset=oled_reset)
font = ImageFont.load_default()

# Setup OpenAI
openai.api_key = OPENAI_API_KEY

def speak(text):
    engine.say(text)
    engine.runAndWait()

def check_bluetooth_connected(address):
    result = os.system(f"bluetoothctl info {address} | grep 'Connected: yes' > /dev/null")
    return result == 0

def check_wifi_connected(interface):
    result = os.system(f"iwconfig {interface} | grep 'ESSID:\"' > /dev/null")
    return result == 0

def display_message_on_oled(message):
    oled.fill(0)
    oled.show()
    image = Image.new("1", (oled.width, oled.height))
    draw = ImageDraw.Draw(image)
    draw.text((0, 0), message, font=font, fill=255)
    oled.image(image)
    oled.show()

def scroll_text_on_oled(text):
    for i in range(0, len(text) * 6):
        display_message_on_oled(text[max(0, i - oled.width // 6):i])
        time.sleep(0.1)

def chat_with_gpt(prompt):
    response = openai.Completion.create(
        model="text-davinci-003",
        prompt=prompt,
        max_tokens=150
    )
    return response.choices[0].text.strip()

def main():
    if not check_bluetooth_connected(PHONE_BLUETOOTH_ADDRESS):
        scroll_text_on_oled("Bluetooth X")
        speak("Phone is not connected via Bluetooth. Script will not run.")
        return

    if not check_bluetooth_connected(EARBUDS_BLUETOOTH_ADDRESS):
        scroll_text_on_oled("Earbuds X")
        speak("Earbuds are not connected via Bluetooth. Script will not run.")
        return

    if not check_wifi_connected(WIFI_INTERFACE):
        scroll_text_on_oled("Wifi X")
        speak("WiFi is not connected. Script will not run.")
        return

    speak("All systems are connected. Script is running.")

    r = sr.Recognizer()
    gpt_active = False

    while True:
        try:
            with sr.Microphone() as source:
                print("Listening...")
                audio = r.listen(source)

            command = r.recognize_google(audio).lower()
            print(f"Command: {command}")

            if "gpt" in command:
                speak("ChatGPT mode activated. How can I assist you?")
                gpt_active = True
                continue

            if "undo gpt" in command:
                speak("ChatGPT mode deactivated.")
                gpt_active = False
                continue

            if gpt_active:
                response = chat_with_gpt(command)
                speak(response)
                continue

            if "notify me" in command:
                pushes = pb.get_pushes()
                latest_push = pushes[0]
                scroll_text_on_oled(f"Notification: {latest_push['title']}: {latest_push['body']}")
                speak(f"Notification from {latest_push['title']}. {latest_push['body']}")

                if "reply" in command:
                    speak("What would you like to reply?")
                    with sr.Microphone() as source:
                        reply_audio = r.listen(source)
                    reply = r.recognize_google(reply_audio)
                    pb.push_sms(PHONE_BLUETOOTH_ADDRESS, latest_push['receiver'], reply)
                    speak(f"Replied: {reply}")

                if "voice message" in command:
                    speak("Recording voice message after the beep.")
                    time.sleep(1)
                    # Record and send voice message logic
                    # ...
                    speak("Voice message sent.")

            elif "stop" in command:
                speak("Stopping the script.")
                break

        except sr.UnknownValueError:
            print("Google Speech Recognition could not understand audio")
        except sr.RequestError as e:
            print(f"Could not request results from Google Speech Recognition service; {e}")

if __name__ == "__main__":
    main()