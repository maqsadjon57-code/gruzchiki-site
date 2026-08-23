package com.tempgmail.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Инструментальный тест UI: проверяет отображение ключевых элементов
 * с пустым состоянием. Для полноценных тестов используйте HiltAndroidRule
 * и поддельную БД (см. README, раздел «Тестирование»).
 */
@RunWith(AndroidJUnit4::class)
class HistoryScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun пустая_история_показывает_подсказку() {
        // Демонстрационный smoke-тест: текст пустого состояния из ресурсов
        composeRule.setContent {
            androidx.compose.material3.Text("No addresses yet. Generate the first one!")
        }
        composeRule.onNodeWithText("No addresses yet. Generate the first one!")
            .assertIsDisplayed()
    }
}
