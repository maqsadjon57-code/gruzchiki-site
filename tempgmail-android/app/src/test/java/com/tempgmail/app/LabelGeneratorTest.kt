package com.tempgmail.app

import com.tempgmail.app.util.LabelGenerator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Юнит-тесты генератора меток плюс-адресов. */
class LabelGeneratorTest {

    @Test
    fun `метка имеет запрошенную длину`() {
        repeat(50) {
            val label = LabelGenerator.generate(8, useLetters = true, useDigits = true)
            assertEquals(8, label.length)
        }
    }

    @Test
    fun `метка на границах допустимой длины`() {
        assertEquals(4, LabelGenerator.generate(4, true, true).length)
        assertEquals(16, LabelGenerator.generate(16, true, true).length)
    }

    @Test
    fun `только буквы когда цифры выключены`() {
        repeat(20) {
            val label = LabelGenerator.generate(12, useLetters = true, useDigits = false)
            assertTrue(label.all { it in 'a'..'z' })
        }
    }

    @Test
    fun `только цифры когда буквы выключены`() {
        repeat(20) {
            val label = LabelGenerator.generate(12, useLetters = false, useDigits = true)
            assertTrue(label.all { it.isDigit() })
        }
    }

    @Test
    fun `пустые флаги не дают пустую метку`() {
        // Безопасность: если всё выключено, всё равно генерируем буквы
        val label = LabelGenerator.generate(8, useLetters = false, useDigits = false)
        assertEquals(8, label.length)
    }

    @Test
    fun `последовательные метки различаются`() {
        val a = LabelGenerator.generate(8, true, true)
        val b = LabelGenerator.generate(8, true, true)
        assertNotEquals(a, b)
    }

    @Test
    fun `умная метка из названия сайта`() {
        val label = LabelGenerator.generateForSite("Amazon Shop")
        assertTrue(label.startsWith("amazon-shop-"))
        assertTrue(label.length > "amazon-shop-".length)
    }

    @Test
    fun `умная метка чистит спецсимволы`() {
        val label = LabelGenerator.generateForSite("Ozon! (ОЗОН) market")
        assertTrue(LabelGenerator.isValidCustomLabel(label.take(label.lastIndexOf('-'))))
        assertFalse(label.contains('!'))
    }

    @Test
    fun `пустой сайт даёт метку site`() {
        assertTrue(LabelGenerator.generateForSite("   ").startsWith("site-"))
    }

    @Test
    fun `валидация пользовательской метки`() {
        assertTrue(LabelGenerator.isValidCustomLabel("abc"))
        assertTrue(LabelGenerator.isValidCustomLabel("a-b_c.d"))
        assertFalse(LabelGenerator.isValidCustomLabel(""))
        assertFalse(LabelGenerator.isValidCustomLabel("-abc"))
        assertFalse(LabelGenerator.isValidCustomLabel("abc "))
        assertFalse(LabelGenerator.isValidCustomLabel("a".repeat(31)))
    }
}
