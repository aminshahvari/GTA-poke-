# Independent check of the printed QR: decodes the card with OpenCV's QR detector (a different implementation from the
# reportlab encoder that made it) and asserts an exact match with the expected URL.
# Checks: the PDF rendered at 300 dpi (as printed), the PNG preview, the card scaled to phone-camera sizes, and a simulated
# phone photo (tilted, slightly blurred, darker, JPEG-compressed).
# Usage: python3 -I verify_qr.py <card.pdf> <preview.png> <expected url>
import sys, subprocess, tempfile, os
import cv2, numpy as np
pdf, png, want = sys.argv[1], sys.argv[2], sys.argv[3]
det = cv2.QRCodeDetector()
def decode(img):
    val, pts, _ = det.detectAndDecode(img)
    return val
results, fails = [], 0
def check(name, img):
    global fails
    got = decode(img); ok = got == want
    fails += not ok
    results.append(f"{'ok  ' if ok else 'FAIL'} {name}: {img.shape[1]}x{img.shape[0]} px -> {got!r}")
with tempfile.TemporaryDirectory() as d:
    subprocess.run(['pdftoppm', '-r', '300', '-png', '-singlefile', pdf, os.path.join(d, 'page')], check=True)
    page = cv2.imread(os.path.join(d, 'page.png'))
check('PDF rendered at 300 dpi', page)
mm = page.shape[1] / 154.0
check('PNG preview', cv2.imread(png))
for w in (1080, 720, 540):
    check(f'whole card scaled to {w} px wide', cv2.resize(page, (w, round(page.shape[0] * w / page.shape[1])), interpolation=cv2.INTER_AREA))
h, w = page.shape[:2]
src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
dst = np.float32([[w * .08, h * .05], [w * .95, 0], [w, h], [0, h * .93]])
photo = cv2.warpPerspective(page, cv2.getPerspectiveTransform(src, dst), (w, h), borderValue=(40, 40, 40))
photo = cv2.GaussianBlur(cv2.convertScaleAbs(photo, alpha=.75, beta=-10), (5, 5), 1.2)
photo = cv2.resize(photo, (1000, round(h * 1000 / w)), interpolation=cv2.INTER_AREA)
ok, jpg = cv2.imencode('.jpg', photo, [cv2.IMWRITE_JPEG_QUALITY, 70])
check('simulated phone photo (tilted, blurred, darker, JPEG 70)', cv2.imdecode(jpg, cv2.IMREAD_COLOR))
print('\n'.join(results))
print(f'{len(results) - fails} decoded exactly, {fails} failed; expected {want!r}')
sys.exit(1 if fails else 0)
