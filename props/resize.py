from PIL import Image
import os

# Set target size
target_size = (32, 32)

# Create an output folder for resized images
output_folder = "resized_32x32"
os.makedirs(output_folder, exist_ok=True)

# Loop through all files in the current folder
for filename in os.listdir("."):
  if filename.lower().endswith(".png"):
    # Open image
    with Image.open(filename) as img:
      # Resize image using high quality filter
      img_resized = img.resize(target_size, Image.Resampling.LANCZOS)

      # Save to output folder
      save_path = os.path.join(output_folder, filename)
      img_resized.save(save_path)
      print(f"Resized: {filename}")

print("All PNG files are now resized to 32x32!")
