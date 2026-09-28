<template>
  <view v-if="active" class="udt-root">
    <view v-if="!open" class="udt-launcher" @click="openPanel"><text>DEBUG</text></view>
    <view v-else class="udt-panel">
        <view class="udt-heading">
          <view><text class="udt-kicker">UNI / DEBUG</text><text class="udt-title">调试工具箱</text></view>
          <text class="udt-close" @click="open = false">×</text>
        </view>
        <scroll-view class="udt-tabs" scroll-x>
          <text v-for="item in tabs" :key="item.key" class="udt-tab" :class="{ selected: tab === item.key }" @click="switchTab(item.key)">{{ item.name }}</text>
        </scroll-view>
        <view v-if="tab === 'logs' || tab === 'requests'" class="udt-toolbar">
          <input v-model="filter" class="udt-search" placeholder="搜索内容" placeholder-class="udt-placeholder" />
          <text class="udt-action" @click="clearCurrent">清空</text>
        </view>
        <scroll-view class="udt-content" scroll-y>
          <template v-if="tab === 'logs'">
            <view v-for="entry in visibleLogs" :key="entry.id" class="udt-row" @click="selectDetail(entry)">
              <view class="udt-row-head"><text class="udt-level" :class="entry.level">{{ entry.level.toUpperCase() }}</text><text>{{ timeOf(entry.time) }}</text></view>
              <text class="udt-row-text">{{ entry.text }}</text>
            </view>
            <text v-if="!visibleLogs.length" class="udt-empty">暂无日志</text>
          </template>
          <template v-else-if="tab === 'requests'">
            <view v-for="entry in visibleRequests" :key="entry.id" class="udt-row" @click="selectDetail(entry)">
              <view class="udt-row-head"><text class="udt-method">{{ entry.method }}</text><text>{{ entry.statusCode ?? (entry.error ? '失败' : '请求中') }} · {{ entry.duration ?? '—' }} ms</text></view>
              <text class="udt-row-text">{{ entry.url }}</text>
            </view>
            <text v-if="!visibleRequests.length" class="udt-empty">暂无请求</text>
          </template>
          <template v-else-if="tab === 'system'">
            <view v-for="item in systemRows" :key="item.key" class="udt-pair"><text class="udt-pair-key">{{ item.key }}</text><text class="udt-pair-value">{{ item.value }}</text></view>
          </template>
          <template v-else>
            <view class="udt-toolbar inside"><input v-model="filter" class="udt-search" placeholder="搜索存储键" placeholder-class="udt-placeholder" /><text class="udt-action" @click="refreshStorage">刷新</text></view>
            <view v-for="key in visibleStorageKeys" :key="key" class="udt-row" @click="openStorage(key)"><text class="udt-storage-key">{{ key }}</text><text class="udt-row-hint">点击查看或编辑 →</text></view>
            <text v-if="!visibleStorageKeys.length" class="udt-empty">暂无存储数据</text>
          </template>
        </scroll-view>
        <view v-if="detail" class="udt-detail">
          <view class="udt-detail-head"><text>详情</text><text @click="detail = ''">关闭 ×</text></view>
          <scroll-view scroll-y class="udt-detail-body"><text selectable>{{ detail }}</text></scroll-view>
        </view>
        <view v-if="editingKey" class="udt-detail">
          <view class="udt-detail-head"><text>{{ editingKey }}</text><text @click="editingKey = ''">关闭 ×</text></view>
          <textarea v-model="editingValue" class="udt-editor" maxlength="-1" />
          <view class="udt-edit-actions"><text @click="removeStorage">删除</text><text @click="saveStorage">保存</text></view>
        </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
const props = defineProps({ controller: { type: Object, required: true } })
const toolbox = props.controller

const tabs = [{ key: 'logs', name: '日志' }, { key: 'requests', name: '请求' }, { key: 'system', name: '系统' }, { key: 'storage', name: '存储' }]
const active = ref(toolbox.active)
const open = ref(false)
const tab = ref('logs')
const filter = ref('')
const state = ref(toolbox.snapshot())
const system = ref({})
const storageKeys = ref([])
const detail = ref('')
const editingKey = ref('')
const editingValue = ref('')
let unsubscribe

onMounted(() => {
  unsubscribe = toolbox.subscribe(() => { active.value = toolbox.active; state.value = toolbox.snapshot() })
})
onUnmounted(() => unsubscribe?.())

const visibleLogs = computed(() => state.value.logs.filter(item => item.text.toLowerCase().includes(filter.value.toLowerCase())).slice().reverse())
const visibleRequests = computed(() => state.value.requests.filter(item => item.url.toLowerCase().includes(filter.value.toLowerCase())).slice().reverse())
const visibleStorageKeys = computed(() => storageKeys.value.filter(key => key.toLowerCase().includes(filter.value.toLowerCase())))
const systemRows = computed(() => Object.entries(system.value).map(([key, value]) => ({ key, value: typeof value === 'object' ? format(value) : String(value) })))

function format(value) {
  try { return JSON.stringify(value, null, 2) ?? String(value) } catch (_) { return String(value) }
}
function timeOf(timestamp) { return new Date(timestamp).toLocaleTimeString() }
function openPanel() { open.value = true; switchTab(tab.value) }
function switchTab(next) {
  tab.value = next; filter.value = ''; detail.value = ''; editingKey.value = ''
  if (next === 'system') system.value = toolbox.getSystemInfo()
  if (next === 'storage') refreshStorage()
}
function refreshStorage() { storageKeys.value = toolbox.listStorageKeys() }
function clearCurrent() { toolbox.clear(tab.value) }
function selectDetail(entry) { detail.value = format(entry) }
function openStorage(key) { editingKey.value = key; editingValue.value = format(toolbox.getStorage(key)) }
function saveStorage() {
  const key = editingKey.value
  if (!key) return
  uni.showModal({ title: '保存存储', content: `确认覆盖 ${key}？`, success: ({ confirm }) => {
    if (!confirm) return
    let value = editingValue.value
    try { value = JSON.parse(value) } catch (_) { /* retain string */ }
    try { toolbox.setStorage(key, value); editingKey.value = ''; refreshStorage() }
    catch (error) { uni.showToast({ title: String(error), icon: 'none' }) }
  } })
}
function removeStorage() {
  const key = editingKey.value
  if (!key) return
  uni.showModal({ title: '删除存储', content: `确认删除 ${key}？`, success: ({ confirm }) => {
    if (!confirm) return
    try { toolbox.removeStorage(key); editingKey.value = ''; refreshStorage() }
    catch (error) { uni.showToast({ title: String(error), icon: 'none' }) }
  } })
}
</script>

<style scoped>
.udt-root { position: fixed; right: 0; bottom: 0; width: 0; height: 0; z-index: 2147483000; font-family: sans-serif; }
.udt-launcher { pointer-events: auto; position: fixed; right: 24px; bottom: 28px; min-width: 68px; height: 38px; padding: 0 12px; display: flex; align-items: center; justify-content: center; border: 1px solid #1765d1; border-radius: 8px; background: #2675e6; color: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.22); font-size: 12px; font-weight: 700; letter-spacing: 1.4px; }
.udt-panel { pointer-events: auto; position: fixed; left: 0; right: 0; bottom: 0; width: 100%; height: 66vh; box-sizing: border-box; padding-bottom: env(safe-area-inset-bottom); background: #fff; color: #20252b; border-top: 1px solid #d7dfe7; border-radius: 8px 8px 0 0; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 -4px 18px rgba(0,0,0,.18); }
.udt-heading { min-height: 50px; box-sizing: border-box; padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; background: #f4f6f8; border-bottom: 1px solid #dfe5eb; }
.udt-kicker { display: block; color: #66829e; font-size: 9px; font-weight: 700; letter-spacing: 1.5px; }
.udt-title { display: block; margin-top: 2px; font-size: 15px; font-weight: 700; }
.udt-close { padding: 2px 8px; color: #596775; font-size: 28px; }
.udt-tabs { flex: none; height: 42px; white-space: nowrap; border-bottom: 1px solid #dfe5eb; }
.udt-tab { display: inline-flex; align-items: center; justify-content: center; height: 42px; min-width: 74px; color: #647381; font-size: 13px; }
.udt-tab.selected { color: #176bd5; border-bottom: 2px solid #2675e6; font-weight: 700; }
.udt-toolbar { display: flex; gap: 12px; align-items: center; padding: 8px 14px; border-bottom: 1px solid #e7ebef; }
.udt-toolbar.inside { padding: 0 0 10px; }
.udt-search { flex: 1; height: 32px; padding: 0 10px; border-radius: 5px; background: #f0f3f6; color: #20252b; font-size: 12px; }
.udt-placeholder { color: #8b98a4; }
.udt-action { color: #176bd5; font-size: 12px; white-space: nowrap; }
.udt-content { flex: 1; min-height: 0; padding: 0 14px; box-sizing: border-box; }
.udt-row { padding: 11px 1px; border-bottom: 1px solid #e7ebef; }
.udt-row-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px; color: #71808e; font-size: 11px; }
.udt-level, .udt-method { color: #176bd5; font-weight: 700; letter-spacing: .5px; }
.udt-level.warn { color: #a66b00; }.udt-level.error { color: #c53838; }
.udt-row-text { display: block; color: #20252b; font-size: 12px; line-height: 1.45; word-break: break-all; }
.udt-empty { display: block; padding: 30px 0; color: #71808e; text-align: center; font-size: 12px; }
.udt-pair { display: flex; gap: 14px; padding: 9px 0; border-bottom: 1px solid #e7ebef; font-size: 12px; }
.udt-pair-key { width: 38%; flex: none; color: #71808e; word-break: break-all; }
.udt-pair-value { flex: 1; color: #20252b; word-break: break-all; }
.udt-storage-key { display: block; color: #20252b; font-size: 13px; font-weight: 600; }
.udt-row-hint { display: block; margin-top: 4px; color: #71808e; font-size: 11px; }
.udt-detail { position: absolute; left: 0; right: 0; bottom: 0; height: 60%; padding: 14px; box-sizing: border-box; background: #fff; border-top: 1px solid #d7dfe7; box-shadow: 0 -4px 18px rgba(0,0,0,.14); display: flex; flex-direction: column; }
.udt-detail-head { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; font-weight: 700; }
.udt-detail-head text:last-child { color: #176bd5; font-weight: 400; }
.udt-detail-body { flex: 1; min-height: 0; color: #20252b; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
.udt-editor { width: 100%; flex: 1; min-height: 0; box-sizing: border-box; padding: 10px; border-radius: 5px; background: #f0f3f6; color: #20252b; font-size: 12px; }
.udt-edit-actions { display: flex; justify-content: flex-end; gap: 20px; padding: 14px 2px 4px; color: #176bd5; font-size: 13px; }
.udt-edit-actions text:first-child { color: #c53838; }
</style>
