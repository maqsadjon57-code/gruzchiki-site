.class public Lcom/gmailgen/app/MainActivity;
.super Landroid/app/Activity;

.field private webView:Landroid/webkit/WebView;
.field private progress:Landroid/widget/ProgressBar;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .registers 9

    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    # Корневой контейнер
    new-instance v0, Landroid/widget/FrameLayout;
    invoke-direct {v0, p0}, Landroid/widget/FrameLayout;-><init>(Landroid/content/Context;)V

    # WebView
    new-instance v1, Landroid/webkit/WebView;
    invoke-direct {v1, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v1, p0, Lcom/gmailgen/app/MainActivity;->webView:Landroid/webkit/WebView;

    # Настройки WebView
    invoke-virtual {v1}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v2
    const/4 v3, 0x1
    invoke-virtual {v2, v3}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v2, v3}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v2, v3}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
    invoke-virtual {v2, v3}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V
    invoke-virtual {v2, v3}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V

    # Cookies (нужны для согласия cookie-баннеров и работы приложения)
    invoke-static {}, Landroid/webkit/CookieManager;->getInstance()Landroid/webkit/CookieManager;
    move-result-object v2
    invoke-virtual {v2, v3}, Landroid/webkit/CookieManager;->setAcceptCookie(Z)V

    # WebViewClient — навигация внутри приложения / наружу
    new-instance v2, Lcom/gmailgen/app/AppWebClient;
    invoke-direct {v2}, Lcom/gmailgen/app/AppWebClient;-><init>()V
    invoke-virtual {v1, v2}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    # Горизонтальный индикатор загрузки (android.R.attr.progressBarStyleHorizontal = 0x01010078)
    new-instance v2, Landroid/widget/ProgressBar;
    const/4 v3, 0x0
    const v4, 0x1010078
    invoke-direct {v2, p0, v3, v4}, Landroid/widget/ProgressBar;-><init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V
    iput-object v2, p0, Lcom/gmailgen/app/MainActivity;->progress:Landroid/widget/ProgressBar;

    # LayoutParams: MATCH_PARENT x WRAP_CONTENT, сверху
    new-instance v3, Landroid/widget/FrameLayout$LayoutParams;
    const/4 v4, -0x1
    const/4 v5, -0x2
    const/16 v6, 0x30
    invoke-direct {v3, v4, v5, v6}, Landroid/widget/FrameLayout$LayoutParams;-><init>(III)V

    # WebChromeClient для прогресса загрузки
    new-instance v4, Lcom/gmailgen/app/AppChromeClient;
    invoke-direct {v4, v2}, Lcom/gmailgen/app/AppChromeClient;-><init>(Landroid/widget/ProgressBar;)V
    invoke-virtual {v1, v4}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    # Собираем разметку
    invoke-virtual {v0, v1}, Landroid/widget/FrameLayout;->addView(Landroid/view/View;)V
    invoke-virtual {v0, v2, v3}, Landroid/widget/FrameLayout;->addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V

    invoke-virtual {p0, v0}, Lcom/gmailgen/app/MainActivity;->setContentView(Landroid/view/View;)V

    # Загружаем генератор Gmail
    const-string v0, "https://products.aspose.app/email/ru/gmail-generator"
    invoke-virtual {v1, v0}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    return-void
.end method

.method public onBackPressed()V
    .registers 2
    iget-object v0, p0, Lcom/gmailgen/app/MainActivity;->webView:Landroid/webkit/WebView;
    if-eqz v0, :gosuper
    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z
    move-result v0
    if-eqz v0, :gosuper
    iget-object v0, p0, Lcom/gmailgen/app/MainActivity;->webView:Landroid/webkit/WebView;
    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V
    return-void
    :gosuper
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V
    return-void
.end method

.method protected onDestroy()V
    .registers 2
    iget-object v0, p0, Lcom/gmailgen/app/MainActivity;->webView:Landroid/webkit/WebView;
    if-eqz v0, :skip
    invoke-virtual {v0}, Landroid/webkit/WebView;->destroy()V
    :skip
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V
    return-void
.end method
