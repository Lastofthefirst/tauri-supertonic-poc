package com.plugin.music_notification

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat as MediaNotificationCompat
import androidx.media.session.MediaButtonReceiver

class MusicPlayerService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "MusicPlayerChannel"
        const val ACTION_PLAY = "com.plugin.music_notification.PLAY"
        const val ACTION_PAUSE = "com.plugin.music_notification.PAUSE"
        const val ACTION_RESUME = "com.plugin.music_notification.RESUME"
        const val ACTION_STOP = "com.plugin.music_notification.STOP"
        const val ACTION_NEXT = "com.plugin.music_notification.NEXT"
        const val ACTION_PREVIOUS = "com.plugin.music_notification.PREVIOUS"
        const val ACTION_SEEK = "com.plugin.music_notification.SEEK"
        
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
        const val EXTRA_ARTIST = "artist"
        const val EXTRA_ALBUM = "album"
        const val EXTRA_POSITION = "position"

        var instance: MusicPlayerService? = null
        private val tracks = mutableListOf<TrackInfo>()
        private var currentTrackIndex = 0
    }

    data class TrackInfo(
        val url: String,
        val title: String,
        val artist: String,
        val album: String
    )

    private var mediaPlayer: MediaPlayer? = null
    private var isPrepared = false
    private lateinit var handler: Handler
    private lateinit var progressRunnable: Runnable
    private lateinit var mediaSession: MediaSessionCompat
    private var currentUrl: String? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        handler = Handler(Looper.getMainLooper())
        mediaSession = MediaSessionCompat(this, "MusicPlayerService")

        mediaSession.setCallback(object : MediaSessionCompat.Callback() {
            override fun onPlay() {
                MusicNotificationPlugin.instance?.emitMediaAction("play")
                resumeMusic()
            }

            override fun onPause() {
                MusicNotificationPlugin.instance?.emitMediaAction("pause")
                pauseMusic()
            }

            override fun onSkipToNext() {
                // Emit event BEFORE playing next - let JS handle the queue
                android.util.Log.d("MusicPlayerService", "onSkipToNext called, plugin instance: ${MusicNotificationPlugin.instance}")
                MusicNotificationPlugin.instance?.emitMediaAction("next")
                // Don't call playNextTrack() - let JS control the queue
            }

            override fun onSkipToPrevious() {
                // Emit event BEFORE playing previous - let JS handle the queue
                android.util.Log.d("MusicPlayerService", "onSkipToPrevious called, plugin instance: ${MusicNotificationPlugin.instance}")
                MusicNotificationPlugin.instance?.emitMediaAction("previous")
                // Don't call playPreviousTrack() - let JS control the queue
            }

            override fun onStop() {
                MusicNotificationPlugin.instance?.emitMediaAction("stop")
                stopMusic()
            }

            override fun onSeekTo(pos: Long) {
                mediaPlayer?.seekTo(pos.toInt())
                updatePlaybackState()
            }
        })

        mediaSession.isActive = true

        progressRunnable = object : Runnable {
            override fun run() {
                mediaPlayer?.let {
                    if (it.isPlaying) {
                        updatePlaybackState()
                        updateNotification()
                        handler.postDelayed(this, 1000)
                    }
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        MediaButtonReceiver.handleIntent(mediaSession, intent)

        intent?.let {
            when (it.action) {
                ACTION_PLAY -> {
                    val url = it.getStringExtra(EXTRA_URL) ?: return START_STICKY
                    val title = it.getStringExtra(EXTRA_TITLE) ?: "Unknown Title"
                    val artist = it.getStringExtra(EXTRA_ARTIST) ?: "Unknown Artist"
                    val album = it.getStringExtra(EXTRA_ALBUM) ?: "Unknown Album"
                    playMusic(url, title, artist, album)
                }
                ACTION_PAUSE -> pauseMusic()
                ACTION_RESUME -> resumeMusic()
                ACTION_STOP -> stopMusic()
                ACTION_NEXT -> playNextTrack()
                ACTION_PREVIOUS -> playPreviousTrack()
                ACTION_SEEK -> {
                    val position = it.getLongExtra(EXTRA_POSITION, 0)
                    mediaPlayer?.seekTo(position.toInt())
                    updatePlaybackState()
                }
            }
        }

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())

        return START_STICKY
    }

    fun addTrack(url: String, title: String, artist: String, album: String) {
        tracks.add(TrackInfo(url, title, artist, album))
    }

    private fun playMusic(url: String, title: String, artist: String, album: String) {
        if (currentUrl == url && mediaPlayer != null && isPrepared) {
            resumeMusic()
            return
        }

        mediaPlayer?.apply {
            stop()
            release()
        }
        mediaPlayer = null
        isPrepared = false
        currentUrl = url

        mediaPlayer = MediaPlayer().apply {
            try {
                setDataSource(url)
                setOnPreparedListener { mp ->
                    isPrepared = true
                    mediaSession.setMetadata(
                        MediaMetadataCompat.Builder()
                            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
                            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, mp.duration.toLong())
                            .build()
                    )
                    resumeMusic()
                }
                setOnErrorListener { _, _, _ ->
                    isPrepared = false
                    false
                }
                setOnCompletionListener {
                    playNextTrack()
                }
                prepareAsync()
            } catch (e: Exception) {
                e.printStackTrace()
                isPrepared = false
            }
        }
    }

    private fun resumeMusic() {
        mediaPlayer?.let {
            if (isPrepared && !it.isPlaying) {
                it.start()
                handler.post(progressRunnable)
                updatePlaybackState()
                updateNotification()
            }
        }
    }

    private fun pauseMusic() {
        mediaPlayer?.let {
            if (it.isPlaying) {
                it.pause()
                handler.removeCallbacks(progressRunnable)
                updatePlaybackState()
                updateNotification()
            }
        }
    }

    private fun stopMusic() {
        handler.removeCallbacks(progressRunnable)
        mediaPlayer?.apply {
            if (isPlaying) {
                stop()
            }
            release()
        }
        mediaPlayer = null
        isPrepared = false
        currentUrl = null
        updatePlaybackState()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun playNextTrack() {
        if (tracks.isEmpty()) return
        currentTrackIndex = (currentTrackIndex + 1) % tracks.size
        val track = tracks[currentTrackIndex]
        playMusic(track.url, track.title, track.artist, track.album)
    }

    private fun playPreviousTrack() {
        if (tracks.isEmpty()) return
        currentTrackIndex = if (currentTrackIndex - 1 < 0) tracks.size - 1 else currentTrackIndex - 1
        val track = tracks[currentTrackIndex]
        playMusic(track.url, track.title, track.artist, track.album)
    }

    private fun createNotification(): Notification {
        val controller = mediaSession.controller
        val mediaMetadata = controller.metadata
        val description = mediaMetadata?.description

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)

        val isPlaying = mediaPlayer?.isPlaying == true

        val playPauseAction = NotificationCompat.Action(
            if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
            if (isPlaying) "Pausar" else "Reproducir",
            MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_PLAY_PAUSE)
        )

        val previousAction = NotificationCompat.Action(
            android.R.drawable.ic_media_previous, "Anterior",
            MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
        )

        val nextAction = NotificationCompat.Action(
            android.R.drawable.ic_media_next, "Siguiente",
            MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT)
        )

        builder.setContentTitle(description?.title ?: "Music Player")
            .setContentText(description?.subtitle ?: "")
            .setSubText(description?.description ?: "")
            .setContentIntent(controller.sessionActivity)
            .setDeleteIntent(
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_STOP)
            )
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(isPlaying)
            .addAction(previousAction)
            .addAction(playPauseAction)
            .addAction(nextAction)
            .setStyle(
                MediaNotificationCompat.MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )

        return builder.build()
    }

    private fun updateNotification() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, createNotification())
    }

    private fun updatePlaybackState() {
        mediaPlayer?.let {
            val state = if (it.isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
            val position = it.currentPosition.toLong()

            val playbackState = PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY_PAUSE or 
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT or 
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or 
                    PlaybackStateCompat.ACTION_STOP or 
                    PlaybackStateCompat.ACTION_SEEK_TO
                )
                .setState(state, position, 1.0f)
                .build()
            mediaSession.setPlaybackState(playbackState)
        }
    }

    fun getPlaybackState(): Triple<Boolean, Long, Long> {
        mediaPlayer?.let {
            return Triple(it.isPlaying, it.currentPosition.toLong(), it.duration.toLong())
        }
        return Triple(false, 0L, 0L)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        handler.removeCallbacks(progressRunnable)
        mediaSession.release()
        mediaPlayer?.apply {
            stop()
            release()
        }
        mediaPlayer = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Music Player Channel",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Music playback controls"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}
