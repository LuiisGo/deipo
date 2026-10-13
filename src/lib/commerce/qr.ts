import "server-only";
import QRCode from "qrcode";
import { trackerUrl } from "./access";
export async function trackerQr(token: string) {
  return QRCode.toDataURL(trackerUrl(token), {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 320,
    color: { dark: "#121212", light: "#ffffff" },
  });
}
