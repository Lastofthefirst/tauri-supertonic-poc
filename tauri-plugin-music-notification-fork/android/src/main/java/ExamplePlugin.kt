package com.plugin.music_notification

import android.app.Activity
import android.content.Intent
import android.os.Build
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@InvokeArg
class PingArgs {
  var value: String? = null
}

@InvokeArg
class PlayArgs {
  var url: String = ""
  var title: String? = null
  var artist: String? = null
  var album: String? = null
}

@InvokeArg
class SeekArgs {
  var position: Long = 0
}

@TauriPlugin
class MusicNotificationPlugin(private val activity: Activity): Plugin(activity) {

    companion object {
        var instance: MusicNotificationPlugin? = null
    }

    override fun load(webView: android.webkit.WebView) {
        super.load(webView)
        instance = this
    }

    // Emit event to JS when media button is pressed
    fun emitMediaAction(action: String) {
        android.util.Log.d("MusicNotificationPlugin", "emitMediaAction called with action: $action")
        val data = JSObject()
        data.put("action", action)
        android.util.Log.d("MusicNotificationPlugin", "Calling trigger('media-action', data)")
        trigger("media-action", data)
        android.util.Log.d("MusicNotificationPlugin", "trigger() completed")
    }

    @Command
    fun ping(invoke: Invoke) {
        val args = invoke.parseArgs(PingArgs::class.java)
        val ret = JSObject()
        ret.put("value", args.value ?: "pong from music notification plugin")
        invoke.resolve(ret)
    }

    @Command
    fun play(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(PlayArgs::class.java)
            
            if (args.url.isEmpty()) {
                val ret = JSObject()
                ret.put("success", false)
                ret.put("message", "URL is required")
                invoke.resolve(ret)
                return
            }

            val serviceIntent = Intent(activity, MusicPlayerService::class.java).apply {
                action = MusicPlayerService.ACTION_PLAY
                putExtra(MusicPlayerService.EXTRA_URL, args.url)
                putExtra(MusicPlayerService.EXTRA_TITLE, args.title ?: "Unknown Title")
                putExtra(MusicPlayerService.EXTRA_ARTIST, args.artist ?: "Unknown Artist")
                putExtra(MusicPlayerService.EXTRA_ALBUM, args.album ?: "Unknown Album")
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                activity.startForegroundService(serviceIntent)
            } else {
                activity.startService(serviceIntent)
            }

            val ret = JSObject()
            ret.put("success", true)
            ret.put("message", "Playing music")
            invoke.resolve(ret)
        } catch (e: Exception) {
            val ret = JSObject()
            ret.put("success", false)
            ret.put("message", e.message)
            invoke.resolve(ret)
        }
    }

    @Command
    fun pause(invoke: Invoke) {
        try {
            val serviceIntent = Intent(activity, MusicPlayerService::class.java).apply {
                action = MusicPlayerService.ACTION_PAUSE
            }
            activity.startService(serviceIntent)

            val ret = JSObject()
            ret.put("success", true)
            invoke.resolve(ret)
        } catch (e: Exception) {
            val ret = JSObject()
            ret.put("success", false)
            invoke.resolve(ret)
        }
    }

    @Command
    fun resume(invoke: Invoke) {
        try {
            val serviceIntent = Intent(activity, MusicPlayerService::class.java).apply {
                action = MusicPlayerService.ACTION_RESUME
            }
            activity.startService(serviceIntent)

            val ret = JSObject()
            ret.put("success", true)
            invoke.resolve(ret)
        } catch (e: Exception) {
            val ret = JSObject()
            ret.put("success", false)
            invoke.resolve(ret)
        }
    }

    @Command
    fun stop(invoke: Invoke) {
        try {
            val serviceIntent = Intent(activity, MusicPlayerService::class.java).apply {
                action = MusicPlayerService.ACTION_STOP
            }
            activity.startService(serviceIntent)

            val ret = JSObject()
            ret.put("success", true)
            invoke.resolve(ret)
        } catch (e: Exception) {
            val ret = JSObject()
            ret.put("success", false)
            invoke.resolve(ret)
        }
    }

    @Command
    fun next(invoke: Invoke) {
        try {
            val serviceIntent = Intent(activity, MusicPlayerService::class.java).apply {
                action = MusicPlayerService.ACTION_NEXT
            }
            activity.startService(serviceIntent)

            val ret = JSObject()
            ret.put("success", true)
            invoke.resolve(ret)
        } catch (e: Exception) {
            val ret = JSObject()
            ret.put("success", false)
            invoke.resolve(ret)
        }
    }

    @Command
    fun previous(invoke: Invoke) {
        try {
            val serviceIntent = Intent(activity, MusicPlayerService::class.java).apply {
                action = MusicPlayerService.ACTION_PREVIOUS
            }
            activity.startService(serviceIntent)

            val ret = JSObject()
            ret.put("success", true)
            invoke.resolve(ret)
        } catch (e: Exception) {
            val ret = JSObject()
            ret.put("success", false)
            invoke.resolve(ret)
        }
    }

    @Command
    fun seek(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SeekArgs::class.java)
            val serviceIntent = Intent(activity, MusicPlayerService::class.java).apply {
                action = MusicPlayerService.ACTION_SEEK
                putExtra(MusicPlayerService.EXTRA_POSITION, args.position)
            }
            activity.startService(serviceIntent)

            val ret = JSObject()
            ret.put("success", true)
            invoke.resolve(ret)
        } catch (e: Exception) {
            val ret = JSObject()
            ret.put("success", false)
            invoke.resolve(ret)
        }
    }

    @Command
    fun getState(invoke: Invoke) {
        try {
            val service = MusicPlayerService.instance
            val ret = JSObject()
            
            if (service != null) {
                val (isPlaying, position, duration) = service.getPlaybackState()
                ret.put("isPlaying", isPlaying)
                ret.put("position", position)
                ret.put("duration", duration)
            } else {
                ret.put("isPlaying", false)
                ret.put("position", 0)
                ret.put("duration", 0)
            }
            
            invoke.resolve(ret)
        } catch (e: Exception) {
            val ret = JSObject()
            ret.put("isPlaying", false)
            ret.put("position", 0)
            ret.put("duration", 0)
            invoke.resolve(ret)
        }
    }
}

