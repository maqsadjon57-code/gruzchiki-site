package com.tempgmail.app

import com.tempgmail.app.util.EmailUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Юнит-тесты утилит валидации и сборки Gmail плюс-адресов. */
class EmailUtilsTest {

    @Test
    fun `валидные gmail адреса принимаются`() {
        assertTrue(EmailUtils.isValidGmail("user@gmail.com"))
        assertTrue(EmailUtils.isValidGmail("u.s.e.r@gmail.com"))
        assertTrue(EmailUtils.isValidGmail("user+tag@gmail.com"))
        assertTrue(EmailUtils.isValidGmail("user@googlemail.com"))
        assertTrue(EmailUtils.isValidGmail("USER@GMAIL.COM"))
    }

    @Test
    fun `не-gmail адреса отклоняются`() {
        assertFalse(EmailUtils.isValidGmail("user@yandex.ru"))
        assertFalse(EmailUtils.isValidGmail("user@gmail.ru"))
        assertFalse(EmailUtils.isValidGmail(""))
        assertFalse(EmailUtils.isValidGmail("not-an-email"))
        assertFalse(EmailUtils.isValidGmail("user@"))
        assertFalse(EmailUtils.isValidGmail("@gmail.com"))
    }

    @Test
    fun `плюс-адрес собирается корректно`() {
        assertEquals(
            "user+abcdefgh@gmail.com",
            EmailUtils.buildPlusAddress("user@gmail.com", "abcdefgh"),
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun `плюс-адрес от битого входа падает`() {
        EmailUtils.buildPlusAddress("nogmail.com", "x")
    }

    @Test
    fun `запрос фильтра Gmail`() {
        assertEquals(
            "to:(user+x1@gmail.com)",
            EmailUtils.filterQuery("user+x1@gmail.com"),
        )
    }

    @Test
    fun `нормализация email`() {
        assertEquals("user@gmail.com", EmailUtils.normalize("  User@Gmail.COM "))
    }
}
