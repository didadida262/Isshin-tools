import { useState, type FormEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleCheck,
  faDownload,
  faFolderOpen,
  faSatelliteDish,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons'
import { motion } from 'framer-motion'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { useToast } from '@/components/Toast'
import {
  downloadBilibiliVideo,
  searchBilibili,
  type BiliSearchItem,
} from './api/bilibiliApi'
import { VideoDetailDialog } from './components/VideoDetailDialog'
import { useDownloadedByBvid } from './hooks/useDownloadedByBvid'

function formatPlay(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return String(n)
}

export function BilibiliDownloaderTool() {
  const { toast } = useToast()
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<BiliSearchItem[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [selected, setSelected] = useState<BiliSearchItem | null>(null)
  const [downloadingBvid, setDownloadingBvid] = useState<string | null>(null)
  const { byBvid, markDownloaded } = useDownloadedByBvid()

  const handleSearch = async (e?: FormEvent) => {
    e?.preventDefault()
    const q = keyword.trim()
    if (!q || searching) return
    setSearching(true)
    setError(null)
    setHasSearched(true)
    try {
      const result = await searchBilibili(q)
      setItems(result)
      if (result.length === 0) {
        toast('未找到相关稿件', 'neutral')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setItems([])
      toast(message, 'danger')
    } finally {
      setSearching(false)
    }
  }

  const handleDownload = async (item: BiliSearchItem) => {
    if (downloadingBvid || byBvid.has(item.bvid)) return
    setDownloadingBvid(item.bvid)
    try {
      const result = await downloadBilibiliVideo({
        bvid: item.bvid,
        title: item.title,
        author: item.author,
      })
      markDownloaded({
        songId: result.songId,
        playlistId: null,
        playlistName: 'B站',
        path: result.path,
        bvid: result.bvid,
        title: item.title,
        artists: item.author,
        downloadedAt: Math.floor(Date.now() / 1000),
      })
      toast('已下载到 downloads/网易云音乐/B站', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'danger')
    } finally {
      setDownloadingBvid(null)
    }
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-hidden p-5 md:p-6">
      <header className="shrink-0">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          B站资源下载器
        </h1>
        <p className="mt-1 text-xs text-muted">
          输入关键词嗅探 B 站视频 · 列表预览 / 弹框播放 · 下载到 downloads/网易云音乐/B站
        </p>
      </header>

      <form onSubmit={(e) => void handleSearch(e)} className="shrink-0">
        <div className="flex items-stretch gap-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入关键词，搜索 B 站相关视频…"
            aria-label="搜索关键词"
            className="h-14 min-w-0 flex-1 rounded-2xl border border-border bg-background px-5 text-base text-foreground outline-none transition-colors placeholder:text-subtle focus:border-muted"
          />
          <button
            type="submit"
            disabled={!keyword.trim() || searching}
            className="inline-flex h-14 shrink-0 items-center gap-2 rounded-2xl border border-border bg-surface px-5 text-sm font-medium text-foreground transition-colors hover:border-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FontAwesomeIcon
              icon={searching ? faSpinner : faSatelliteDish}
              className={`h-4 w-4 ${searching ? 'animate-spin' : ''}`}
            />
            嗅探
          </button>
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {searching && (
          <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted">
            <FontAwesomeIcon icon={faSpinner} className="h-3.5 w-3.5 animate-spin" />
            正在 B 站搜索…
          </div>
        )}

        {!searching && error && (
          <div className="flex h-40 items-center justify-center px-6">
            <p className="text-center text-xs text-danger">{error}</p>
          </div>
        )}

        {!searching && !error && hasSearched && items.length === 0 && (
          <div className="flex h-40 items-center justify-center">
            <p className="text-xs text-muted">未找到相关稿件</p>
          </div>
        )}

        {!searching && !hasSearched && (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-border-subtle">
            <p className="max-w-sm px-6 text-center text-xs leading-relaxed text-muted">
              在上方输入关键词并点击「嗅探」，相关视频会显示在这里。
            </p>
          </div>
        )}

        {!searching && items.length > 0 && (
          <ul className="space-y-2 pb-2">
            {items.map((item, index) => {
              const downloaded = byBvid.get(item.bvid)
              const busy = downloadingBvid === item.bvid
              return (
                <motion.li
                  key={item.bvid}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.2) }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelected(item)
                      }
                    }}
                    className={`flex cursor-pointer gap-3 rounded-2xl border p-3 transition-colors duration-200 hover:bg-surface-hover/50 ${
                      downloaded
                        ? 'border-success/30 bg-success/5'
                        : 'border-border-subtle bg-surface/50'
                    }`}
                  >
                    {item.cover ? (
                      <img
                        src={item.cover}
                        alt=""
                        className="h-16 w-[7.25rem] shrink-0 rounded-xl object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-16 w-[7.25rem] shrink-0 rounded-xl bg-surface-hover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-subtle">
                        {item.author}
                        <span className="mx-1">·</span>
                        {item.durationText}
                        <span className="mx-1">·</span>
                        {formatPlay(item.play)} 播放
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-subtle">{item.bvid}</p>
                    </div>
                    <div
                      className="flex shrink-0 flex-col items-end justify-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {downloaded ? (
                        <>
                          <span className="inline-flex items-center gap-1 px-1.5 text-[11px] text-success">
                            <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
                            已下载
                          </span>
                          <button
                            type="button"
                            onClick={() => void revealItemInDir(downloaded.path)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-background hover:text-foreground"
                            title="打开文件位置"
                            aria-label="打开文件位置"
                          >
                            <FontAwesomeIcon icon={faFolderOpen} className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || downloadingBvid !== null}
                          onClick={() => void handleDownload(item)}
                          className={`inline-flex h-9 min-w-[4.75rem] items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[11px] transition-all ${
                            busy
                              ? 'cursor-wait border-muted bg-surface-hover text-foreground'
                              : 'border-border bg-background text-foreground hover:border-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40'
                          }`}
                        >
                          <FontAwesomeIcon
                            icon={busy ? faSpinner : faDownload}
                            className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`}
                          />
                          {busy ? '下载中' : '下载'}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.li>
              )
            })}
          </ul>
        )}
      </div>

      <VideoDetailDialog
        open={selected !== null}
        item={selected}
        downloaded={selected ? byBvid.get(selected.bvid) ?? null : null}
        onClose={() => setSelected(null)}
        onDownloaded={markDownloaded}
      />
    </div>
  )
}

export default BilibiliDownloaderTool
