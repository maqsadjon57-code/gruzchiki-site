.class public Lcom/gmailgen/app/AppWebClient;
.super Landroid/webkit/WebViewClient;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Landroid/webkit/WebViewClient;-><init>()V
    return-void
.end method

# Ссылки на aspose.* открываем внутри приложения, остальные — во внешнем браузере
.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)Z
    .registers 8

    invoke-static {p2}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v0

    # Схема
    invoke-virtual {v0}, Landroid/net/Uri;->getScheme()Ljava/lang/String;
    move-result-object v1
    if-eqz v1, :load_in_app

    const-string v2, "http"
    invoke-virtual {v1, v2}, Ljava/lang/String;->equalsIgnoreCase(Ljava/lang/String;)Z
    move-result v2
    if-eqz v2, :check_host

    const-string v2, "https"
    invoke-virtual {v1, v2}, Ljava/lang/String;->equalsIgnoreCase(Ljava/lang/String;)Z
    move-result v2
    if-eqz v2, :check_host

    # Не http(s) (intent:, mailto:, tel: и т.п.) — наружу
    goto :external

    :check_host
    invoke-virtual {v0}, Landroid/net/Uri;->getHost()Ljava/lang/String;
    move-result-object v1
    if-eqz v1, :load_in_app

    const-string v2, "aspose."
    invoke-virtual {v1, v2}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z
    move-result v2
    if-eqz v2, :load_in_app

    :external
    :try_start
    new-instance v2, Landroid/content/Intent;
    const-string v3, "android.intent.action.VIEW"
    invoke-direct {v2, v3, v0}, Landroid/content/Intent;-><init>(Ljava/lang/String;Landroid/net/Uri;)V
    invoke-virtual {p1}, Landroid/webkit/WebView;->getContext()Landroid/content/Context;
    move-result-object v3
    invoke-virtual {v3, v2}, Landroid/content/Context;->startActivity(Landroid/content/Intent;)V
    :try_end
    .catch Landroid/content/ActivityNotFoundException; {:try_start .. :try_end} :caught

    const/4 v0, 0x1
    return v0

    :caught
    const/4 v0, 0x1
    return v0

    :load_in_app
    const/4 v0, 0x0
    return v0
.end method
