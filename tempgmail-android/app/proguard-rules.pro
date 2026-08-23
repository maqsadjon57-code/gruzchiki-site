# Правила ProGuard/R8 для release-сборки «Временный Gmail»

# Hilt
-dontwarn dagger.hilt.**
-keep class dagger.hilt.** { *; }

# Room
-keep class * extends androidx.room.RoomDatabase { *; }
-dontwarn androidx.room.**

# Retrofit / OkHttp / Gson
-keepattributes Signature, InnerClasses, EnclosingMethod, RuntimeVisibleAnnotations, AnnotationDefault
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**
-dontwarn com.google.gson.**
# DTO модели Gmail API не обфускаем — они маппятся GSON по именам полей
-keep class com.tempgmail.app.data.remote.dto.** { *; }

# ZXing
-dontwarn com.google.zxing.**

# Google Sign-In
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**
