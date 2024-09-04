import time
import requests
import bluetooth
import socket
import speech_recognition as sr
from gtts import gTTS
from playsound import playsound
from Adafruit_SSD1306 import SSD1306_128_32
import sounddevice as sd
import numpy as np
import os

# Initialize OLED display
disp = SSD1306_128_32(rst=None)
disp.begin()
disp.clear()
disp.display()

# API and Bluetooth setup
api_key = 'YOUR_API_KEY'
api_url = 'https://api.example.com/endpoint'
DEVICE_ADDRESS = 'YOUR_DEVICE_ADDRESS'
PORT = 1  # Example port number

def speak(text):
    tts = gTTS(text=text, lang='en')
    tts.save('response.mp3')
    playsound('response.mp3')
    os.remove('response.mp3')

def display_message(message):
    disp.clear()
    disp.text(message, 0, 0)
    disp.display()

def check_bluetooth():
    try:
        bt_socket = bluetooth.BluetoothSocket(bluetooth.RFCOMM)
        bt_socket.connect((DEVICE_ADDRESS, PORT))
        bt_socket.close()
        return True
    except bluetooth.BluetoothError:
        return False

def check_wifi():
    try:
        socket.create_connection(("www.google.com", 80))
        return True
    except OSError:
        return False

def record_voice():
    fs = 44100
    duration = 10  # seconds
    speak("Beep to start recording")
    sd.play(np.zeros(fs), samplerate=fs)  # Placeholder beep sound
    sd.wait()
    recording = sd.rec(int(duration * fs), samplerate=fs, channels=2)
    sd.wait()
    speak("Stop recording now")
    return recording

def listen_command():
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        print("Listening...")
        audio = recognizer.listen(source)
        try:
            command = recognizer.recognize_google(audio)
            return command.lower()
        except sr.UnknownValueError:
            speak("Sorry, I did not understand that.")
            return None
        except sr.RequestError:
            speak("There is an error with the speech recognition service.")
            return None

def main_loop():
    if not check_bluetooth():
        speak("Bluetooth earbuds are not connected.")
        return
    if not check_wifi():
        speak("Wi-Fi is not connected.")
        return

    bt_socket = bluetooth.BluetoothSocket(bluetooth.RFCOMM)
    bt_socket.connect((DEVICE_ADDRESS, PORT))
    try:
        while True:
            data = bt_socket.recv(1024)
            if data:
                text = data.decode()
                speak(text)
                if "text message" in text:
                    speak("Do you want to reply? Say yes or no.")
                    reply = listen_command()
                    if reply == 'yes':
                        speak("Please say your reply.")
                        message = listen_command()
                        if message:
                            requests.post('https://api.example.com/send_message', json={'message': message})
                elif "voice message" in text:
                    speak("Do you want to send a voice message? Say yes or no.")
                    voice_msg = listen_command()
                    if voice_msg == 'yes':
                        recording = record_voice()
                        requests.post('https://api.example.com/send_voice', files={'file': recording})
    except Exception as e:
        speak("There is an error in the script, please fix it.")
        print(f"Error: {e}")
    finally:
        bt_socket.close()

if __name__ == "__main__":
    main_loop()