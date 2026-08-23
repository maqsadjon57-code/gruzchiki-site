package com.tempgmail.app.util

import android.graphics.Bitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

/**
 * Генерация QR-кодов (ZXing) для быстрой передачи временного адреса:
 * получатель сканирует код и записывает письмо на этот адрес.
 */
object QrCodeUtils {

    /**
     * Создаёт QR-код вида "mailto:адрес" заданного размера.
     * @param content обычно fullEmail
     * @param sizePx размер стороны битмапа в пикселях (512 достаточно)
     */
    fun generate(content: String, sizePx: Int = 512): Bitmap {
        val matrix = QRCodeWriter().encode("mailto:$content", BarcodeFormat.QR_CODE, sizePx, sizePx)
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565)
        for (x in 0 until sizePx) {
            for (y in 0 until sizePx) {
                bitmap.setPixel(x, y, if (matrix[x, y]) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
            }
        }
        return bitmap
    }
}
