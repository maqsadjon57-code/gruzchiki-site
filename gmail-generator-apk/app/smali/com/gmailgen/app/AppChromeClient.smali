.class public Lcom/gmailgen/app/AppChromeClient;
.super Landroid/webkit/WebChromeClient;

.field private final progress:Landroid/widget/ProgressBar;

.method public constructor <init>(Landroid/widget/ProgressBar;)V
    .registers 2
    invoke-direct {p0}, Landroid/webkit/WebChromeClient;-><init>()V
    iput-object p1, p0, Lcom/gmailgen/app/AppChromeClient;->progress:Landroid/widget/ProgressBar;
    return-void
.end method

.method public onProgressChanged(Landroid/webkit/WebView;I)V
    .registers 6

    iget-object v0, p0, Lcom/gmailgen/app/AppChromeClient;->progress:Landroid/widget/ProgressBar;
    if-eqz v0, :done

    invoke-virtual {v0, p2}, Landroid/widget/ProgressBar;->setProgress(I)V

    const/16 v1, 0x64
    if-ge p2, v1, :full
    const/4 v1, 0x0
    goto :setvis
    :full
    const/16 v1, 0x8
    :setvis
    invoke-virtual {v0, v1}, Landroid/widget/ProgressBar;->setVisibility(I)V

    :done
    return-void
.end method
