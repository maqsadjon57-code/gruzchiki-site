package com.tempgmail.app.presentation.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.tempgmail.app.R
import com.tempgmail.app.presentation.ui.screens.HistoryScreen
import com.tempgmail.app.presentation.ui.screens.HomeScreen
import com.tempgmail.app.presentation.ui.screens.OnboardingScreen
import com.tempgmail.app.presentation.ui.screens.SettingsScreen

/** Маршруты навигации приложения. */
object Routes {
    const val ONBOARDING = "onboarding"
    const val HOME = "home"
    const val HISTORY = "history"
    const val SETTINGS = "settings"
}

private data class BottomDest(
    val route: String,
    val labelRes: Int,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
)

/**
 * Корневой навигационный граф: онбординг (при первом запуске) и
 * три основных экрана с нижней навигационной панелью.
 * @param onSignIn колбэк запуска Google Sign-In (предоставляет MainActivity)
 */
@Composable
fun AppNavGraph(
    onSignIn: () -> Unit = {},
    viewModel: com.tempgmail.app.presentation.viewmodel.RootViewModel = hiltViewModel(),
) {
    val onboardingDone by viewModel.onboardingCompleted.collectAsState()

    // Ждём первое значение из БД, чтобы не мигать стартовым экраном
    val startRoute = when (onboardingDone) {
        null -> return
        false -> Routes.ONBOARDING
        true -> Routes.HOME
    }

    val navController = rememberNavController()
    val tabs = listOf(
        BottomDest(Routes.HOME, R.string.nav_home, Icons.Default.Home),
        BottomDest(Routes.HISTORY, R.string.nav_history, Icons.Default.History),
        BottomDest(Routes.SETTINGS, R.string.nav_settings, Icons.Default.Settings),
    )

    Scaffold(
        bottomBar = {
            val backStackEntry by navController.currentBackStackEntryAsState()
            val currentDestination = backStackEntry?.destination
            // Нижняя панель только на основных экранах
            if (currentDestination?.hierarchy?.any { it.route in tabs.map { t -> t.route } } == true) {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = currentDestination.hierarchy.any { it.route == tab.route },
                            onClick = {
                                navController.navigate(tab.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(stringResource(tab.labelRes)) },
                        )
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = startRoute,
            modifier = Modifier.padding(padding),
        ) {
            composable(Routes.ONBOARDING) {
                OnboardingScreen(
                    onFinished = {
                        viewModel.completeOnboarding()
                        navController.navigate(Routes.HOME) {
                            popUpTo(Routes.ONBOARDING) { inclusive = true }
                        }
                    }
                )
            }
            composable(Routes.HOME) { HomeScreen(onSignIn = onSignIn) }
            composable(Routes.HISTORY) { HistoryScreen() }
            composable(Routes.SETTINGS) { SettingsScreen() }
        }
    }
}
