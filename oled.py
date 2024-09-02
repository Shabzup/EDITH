from PIL import Image, ImageDraw, ImageFont
import Adafruit_SSD1306
import time

# Initialize the display
RST = None
disp = Adafruit_SSD1306.SSD1306_128_64(rst=RST)

disp.begin()
disp.clear()
disp.display()

# Get display dimensions
width = disp.width
height = disp.height

# Create a blank image for drawing
image = Image.new('1', (width, height))
draw = ImageDraw.Draw(image)

# Animation parameters
square_size = 10
x = 0
y = 0
x_speed = 2
y_speed = 2

while True:
    # Clear the image
    draw.rectangle((0, 0, width, height), outline=0, fill=0)
    
    # Draw a bouncing square
    draw.rectangle((x, y, x + square_size, y + square_size), outline=255, fill=255)
    
    # Update the display
    disp.image(image)
    disp.display()
    
    # Move the square
    x += x_speed
    y += y_speed
    
    # Bounce off the edges
    if x + square_size >= width or x < 0:
        x_speed = -x_speed
    if y + square_size >= height or y < 0:
        y_speed = -y_speed
    
    # Wait before updating the display
    time.sleep(0.05)