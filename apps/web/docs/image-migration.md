# Image Migration Guide: Retrieving Images from ShopSite

Since the ShopSite API only provides filenames and not the actual image files, a manual "salvage" operation is required to move your product images to the new platform.

## Prerequisites

- **FileZilla** (or any FTP client) installed on your computer.
- **FTP Credentials**: You will need the Host, Username, and Password for your hosting account.
  > **Note**: These are often different from your ShopSite admin login. Check your web hosting control panel (e.g., cPanel, Bluehost, LexiConn) or welcome email for "FTP Details".

## Step 1: Locate Your Image Directory

Before connecting, determine exactly where your images are stored on the server.

1. Log in to your **ShopSite Back Office**.
2. Go to **Preferences > Hosting Service**.
3. Look for the **"Media Directory"** setting (sometimes called "Store Image Directory").
   - Example path: `/home/mystore/public_html/media/`
   - Example path: `/var/www/html/store/images/`
4. Note this path specifically. This is the **Source Folder** you need to find.

## Step 2: Connect with FileZilla

1. Open **FileZilla**.
2. In the "Quickconnect" bar at the top, enter your details:
   - **Host**: `ftp.yourdomain.com` (or your IP address)
   - **Username**: Your FTP username
   - **Password**: Your FTP password
   - **Port**: `21` (for standard FTP) or `22` (for SFTP - recommended if available)
3. Click **Quickconnect**.

## Step 3: Download the Images

1. **Right Side (Remote Site)**: Navigate to the **Media Directory** path you found in Step 1.
   - You may need to double-click folders (e.g., `public_html` -> `media`) to traverse the directory tree.
   - Verify you see image files (e.g., `.jpg`, `.gif`) inside.
2. **Left Side (Local Site)**: Navigate to a folder on your computer where you want to save these images (e.g., create a new folder on your Desktop called `ShopSite_Images`).
3. **Select All**: Click inside the **Remote Site** file list (bottom right pane), press `Ctrl+A` (Windows) or `Cmd+A` (Mac) to select all files.
4. **Download**: Right-click the selected files and choose **Download**.
   - *Tip*: This may take a while if you have thousands of images.

## Step 4: Next Steps (Upload to New Platform)

Once you have the folder of images on your computer:

1. **Upload to Supabase Storage**:
   - We will upload these to your project's `product-images` bucket.
   - We can use a script or the Supabase dashboard for this.
2. **Sync Verification**:
   - Our system has already imported the "filenames" from the database.
   - Once the files are uploaded to the matching bucket, the images should automatically appear on your new site because the filenames will match.

> **Need Help?**
> If you cannot find your FTP credentials, contact your hosting provider's support (e.g., LexiConn, Bluehost) and ask for "FTP Access to my ShopSite media directory".
