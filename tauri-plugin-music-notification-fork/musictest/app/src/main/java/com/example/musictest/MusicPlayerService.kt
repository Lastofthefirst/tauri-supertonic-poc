package com.example.musictest

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

    private var mediaPlayer: MediaPlayer? = null
    private val NOTIFICATION_ID = 1
    private val CHANNEL_ID = "MusicPlayerChannel"
    private var isPrepared = false
    private lateinit var handler: Handler
    private lateinit var progressRunnable: Runnable
    private lateinit var mediaSession: MediaSessionCompat

    override fun onCreate() {
        super.onCreate()
        handler = Handler(Looper.getMainLooper())
        mediaSession = MediaSessionCompat(this, "MusicPlayerService")

        val sessionActivityIntent = Intent(this, MainActivity::class.java)
        val sessionActivityPendingIntent = PendingIntent.getActivity(this, 0, sessionActivityIntent, PendingIntent.FLAG_IMMUTABLE)
        mediaSession.setSessionActivity(sessionActivityPendingIntent)

        mediaSession.setCallback(object : MediaSessionCompat.Callback() {
            override fun onPlay() {
                playMusic()
            }

            override fun onPause() {
                pauseMusic()
            }

            override fun onSkipToNext() {
                // TODO: Implement next track logic
            }

            override fun onSkipToPrevious() {
                // TODO: Implement previous track logic
            }

            override fun onStop() {
                stopSelf()
            }

            override fun onSeekTo(pos: Long) {
                mediaPlayer?.seekTo(pos.toInt())
                updatePlaybackState()
            }
        })

        mediaSession.isActive = true

        progressRunnable = Runnable {
            mediaPlayer?.let {
                if (it.isPlaying) {
                    updatePlaybackState()
                    updateNotification()
                    handler.postDelayed(this.progressRunnable, 1000)
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        MediaButtonReceiver.handleIntent(mediaSession, intent)

        val audioUrl =
            "https://warpfs.hermesbackend.xyz/api/public/Um9ja3N0YXIgLSBQb3N0IE1hbG9uZSAtIE5pbmlvIFNhY3JvIChTcGFuaXNoIFZlcnNpb24pICgxKS5tcDM6MTc2MDQ4MDYwMzEwMQ=="

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())

        if (mediaPlayer == null) {
            mediaPlayer = MediaPlayer().apply {
                setDataSource(audioUrl)
                setOnPreparedListener { mp ->
                    isPrepared = true
                    mediaSession.setMetadata(
                        MediaMetadataCompat.Builder()
                            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "Rockstar")
                            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Post Malone")
                            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, mp.duration.toLong())
                            .build()
                    )
                    playMusic()
                }
                setOnErrorListener { _, _, _ ->
                    stopSelf()
                    false
                }
                prepareAsync()
            }
        }

        return START_STICKY
    }

    private fun playMusic() {
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

        builder.setContentTitle(description?.title)
            .setContentText(description?.subtitle)
            .setSubText(description?.description)
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
                .setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_STOP or PlaybackStateCompat.ACTION_SEEK_TO)
                .setState(state, position, 1.0f)
                .build()
            mediaSession.setPlaybackState(playbackState)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
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
                NotificationManager.IMPORTANCE_HIGH
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}
