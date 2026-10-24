import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from './src/config';

type Loan = { id: string; friendName: string; amount: number; dueDate: string; isRepaid: boolean; isOverdue: boolean; receiptPath?: string | null };
type Summary = { totalLent: number; totalRepaid: number; overdueAmount: number };
const emptySummary: Summary = { totalLent: 0, totalRepaid: 0, overdueAmount: 0 };
const TOKEN_KEY = 'miniledger_token';

async function getStoredToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return globalThis.localStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function saveStoredToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function removeStoredToken(): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [validationErrors, setValidationErrors] = useState<{
    friendName?: string;
    amount?: string;
    dueDate?: string;
  }>({});

  const [otpRequested, setOtpRequested] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pending' | 'history'>('dashboard');
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 900;
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(false);
  const [savingLoan, setSavingLoan] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [friendName, setFriendName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [receipt, setReceipt] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [loanData, summaryData] = await Promise.all([request('/loans'), request('/loans/summary')]);
      setLoans(loanData); setSummary(summaryData);
    } catch (e) { Alert.alert('Could not load data', e instanceof Error ? e.message : 'Try again.'); }
    finally { setLoading(false); }
  }, [request, token]);

  useEffect(() => {
    getStoredToken().then(saved => {
      if (saved) setToken(saved);
    });
  }, []);

  useEffect(() => { if (token) refresh(); }, [token, refresh]);
  async function sendOtp() {
    try {
      await request('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone: phone.trim() }) });
      setOtpRequested(true);
      Alert.alert('OTP requested', 'A mock OTP was generated. Check the backend terminal log.');
    }
    catch (e) { Alert.alert('Could not send OTP', e instanceof Error ? e.message : 'Try again.'); }
  }

  async function verifyOtp() {
    try {
      const data = await request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone: phone.trim(), otp: otp.trim() }) });
      await saveStoredToken(data.token);
      setToken(data.token);
    } catch (e) { Alert.alert('Login failed', e instanceof Error ? e.message : 'Try again.'); }
  }

  async function addLoan() {
    const numericAmount = Number(amount);
    const errors: {
      friendName?: string;
      amount?: string;
      dueDate?: string;
    } = {};
    if (!friendName.trim()) {
      errors.friendName = "Please enter your friend's name.";
    }
    if (!amount.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      errors.amount = 'Amount must be greater than zero.';
    }
    const dateParts = dueDate.split('-').map(Number);
    const [year, month, day] = dateParts;
    const isValidDate =
      /^\d{4}-\d{2}-\d{2}$/.test(dueDate) &&
      dateParts.length === 3 &&
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day) &&
      (() => {
        const date = new Date(Date.UTC(year, month - 1, day));
        return (
          date.getUTCFullYear() === year &&
          date.getUTCMonth() === month - 1 &&
          date.getUTCDate() === day
        );
      })();
    if (!isValidDate) {
      errors.dueDate = 'Enter a valid date in YYYY-MM-DD format.';
    }
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    if (savingLoan) return;
    setSavingLoan(true);
    try {
      let body: FormData | string;
      if (receipt) {
        body = new FormData();
        body.append('friendName', friendName.trim());
        body.append('amount', String(numericAmount));
        body.append(
          'dueDate',
          new Date(`${dueDate}T12:00:00`).toISOString()
        );
        if (Platform.OS === 'web') {
          const imageResponse = await fetch(receipt.uri);
          const imageBlob = await imageResponse.blob();
          body.append(
            'receipt',
            new File(
              [imageBlob],
              receipt.fileName || 'receipt.jpg',
              { type: receipt.mimeType || imageBlob.type || 'image/jpeg' }
            )
          );
        } else {
          body.append('receipt', {
            uri: receipt.uri,
            name: receipt.fileName || 'receipt.jpg',
            type: receipt.mimeType || 'image/jpeg',
          } as any);
        }
      } else {
        body = JSON.stringify({
          friendName: friendName.trim(),
          amount: numericAmount,
          dueDate: new Date(`${dueDate}T12:00:00`).toISOString(),
        });
      }
      await request('/loans', { method: 'POST', body });
      setFriendName(''); setAmount(''); setDueDate(''); setReceipt(null); setShowForm(false); await refresh();
    } catch (e) { Alert.alert('Could not add loan', e instanceof Error ? e.message : 'Try again.'); }
    finally { setSavingLoan(false); }
  }

  async function markRepaid(id: string) {
    try { await request(`/loans/${id}/repay`, { method: 'PATCH' }); await refresh(); }
    catch (e) { Alert.alert('Could not update loan', e instanceof Error ? e.message : 'Try again.'); }
  }

  async function chooseReceipt() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Permission needed', 'Allow photo library access to attach a receipt.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled) setReceipt(result.assets[0]);
  }

  async function logout() { await removeStoredToken(); setToken(null); setOtp(''); setOtpRequested(false); setLoans([]); }
  if (!token) return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.loginWrap}>
    <View style={styles.logo}><Text style={styles.logoText}>M</Text></View><Text style={styles.brand}>MiniLedger</Text><Text style={styles.subtitle}>A little clarity for money lent.</Text>
    <View style={styles.panel}><Text style={styles.heading}>{otpRequested ? 'Verify your number' : 'Welcome back'}</Text><Text style={styles.muted}>{otpRequested ? 'Enter the 6-digit mock OTP printed in the backend terminal.' : 'Sign in with your phone number to manage your loans.'}</Text>
      <Text style={styles.label}>PHONE NUMBER</Text><TextInput style={styles.input} placeholder="e.g. +919876543210" keyboardType="phone-pad" autoCapitalize="none" value={phone} onChangeText={setPhone} editable={!otpRequested} />
      {otpRequested && <><Text style={styles.label}>6-DIGIT OTP</Text><TextInput style={styles.input} placeholder="Enter OTP" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} /></>}
      <Pressable style={styles.primary} onPress={otpRequested ? verifyOtp : sendOtp}><Text style={styles.primaryText}>{otpRequested ? 'Verify and continue' : 'Send mock OTP'}</Text></Pressable>
      {otpRequested && <Pressable onPress={() => { setOtpRequested(false); setOtp(''); }}><Text style={styles.link}>Change phone number</Text></Pressable>}
    </View><Text style={styles.footnote}>Demo authentication · Never use mock OTP in production</Text>
  </KeyboardAvoidingView></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><View style={[styles.appShell, isDesktop && styles.desktopShell]}>
    {isDesktop && <View style={styles.sidebar}>
      <View style={styles.sidebarBrand}><View style={styles.sidebarLogo}><Text style={styles.logoText}>M</Text></View><Text style={styles.sidebarTitle}>MiniLedger</Text><Text style={styles.sidebarTagline}>Your money, accounted for.</Text></View>
      <Pressable style={[styles.navItem, activeTab === 'dashboard' && styles.navItemActive]} onPress={() => { setActiveTab('dashboard'); setShowForm(false); }}><Text style={[styles.navText, activeTab === 'dashboard' && styles.navTextActive]}>⌂  Dashboard</Text></Pressable>
      <Pressable style={styles.navItem} onPress={() => { setActiveTab('dashboard'); setShowForm(true); }}><Text style={styles.navText}>＋  Add loan</Text></Pressable>
      <Pressable style={[styles.navItem, activeTab === 'pending' && styles.navItemActive]} onPress={() => { setActiveTab('pending'); setShowForm(false); }}><Text style={[styles.navText, activeTab === 'pending' && styles.navTextActive]}>◷  Pending loans</Text></Pressable>
      <Pressable style={[styles.navItem, activeTab === 'history' && styles.navItemActive]} onPress={() => { setActiveTab('history'); setShowForm(false); }}><Text style={[styles.navText, activeTab === 'history' && styles.navTextActive]}>✓  History</Text></Pressable>
      <View style={styles.sidebarSpacer} /><Pressable onPress={logout} style={styles.sidebarLogout}><Text style={styles.logoutText}>Log out</Text></Pressable>
    </View>}
    <View style={styles.mainArea}>
      {!isDesktop && (
        <View style={styles.topbar}>
          <View style={styles.mobileBrand}>
            <View style={styles.mobileLogo}>
              <Text style={styles.mobileLogoText}>M</Text>
            </View>
            <View>
              <Text style={styles.brandSmall}>MiniLedger</Text>
              <Text style={styles.mutedSmall}>Your money, accounted for.</Text>
            </View>
          </View>
          <Pressable onPress={logout} style={styles.logout}>
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.greeting}>Your lending overview</Text><Text style={styles.muted}>A clear picture of money you've lent to friends.</Text>
        <View style={styles.summaryCard}><Text style={styles.summaryEyebrow}>TOTAL LENT</Text><Text style={styles.total}>{money(summary.totalLent)}</Text><View style={styles.summaryDivider} /><View style={styles.summaryRow}><View style={styles.summaryMetric}><Text style={styles.metricLabel}>Repaid</Text><Text style={styles.metricValue}>{money(summary.totalRepaid)}</Text></View><View style={styles.summaryMetric}><Text style={styles.metricLabel}>Overdue</Text><Text style={[styles.metricValue, { color: '#F09A8B' }]}>{money(summary.overdueAmount)}</Text></View></View></View>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{activeTab === 'pending' ? 'Pending loans' : activeTab === 'history' ? 'Repayment history' : 'Your entries'}</Text><Pressable style={styles.addButton} onPress={() => setShowForm(!showForm)}><Text style={styles.addButtonText}>{showForm ? 'Cancel' : '+ Add loan'}</Text></Pressable></View>
        {showForm && <View style={styles.panel}><Text style={styles.heading}>New loan</Text><Text style={styles.label}>FRIEND'S NAME</Text><TextInput style={styles.input} placeholder="e.g. Aisha" value={friendName} onChangeText={value => { setFriendName(value); if (validationErrors.friendName) setValidationErrors(previous => ({ ...previous, friendName: undefined })); }} />{validationErrors.friendName && (
          <Text style={styles.errorText}>
            {validationErrors.friendName}
          </Text>
        )}<Text style={styles.label}>AMOUNT (₹)</Text><TextInput style={styles.input} placeholder="e.g. 1500" keyboardType="decimal-pad" value={amount} onChangeText={value => { setAmount(value); if (validationErrors.amount) setValidationErrors(previous => ({ ...previous, amount: undefined })); }} />{validationErrors.amount && (
          <Text style={styles.errorText}>
            {validationErrors.amount}
          </Text>
        )}<Text style={styles.label}>DUE DATE (YYYY-MM-DD)</Text><TextInput style={styles.input} placeholder="2026-11-15" value={dueDate} onChangeText={value => { setDueDate(value); if (validationErrors.dueDate) setValidationErrors(previous => ({ ...previous, dueDate: undefined })); }} />{validationErrors.dueDate && (
          <Text style={styles.errorText}>
            {validationErrors.dueDate}
          </Text>
        )}<Pressable style={styles.receiptButton} onPress={chooseReceipt}><Text style={styles.receiptText}>{receipt ? `Receipt selected: ${receipt.fileName || 'photo'}` : '＋ Attach receipt photo (optional)'}</Text></Pressable>{receipt && (
          <Image
            source={{ uri: receipt.uri }}
            style={styles.receiptPreview}
            resizeMode="contain"
          />
        )}<Pressable style={[styles.primary, savingLoan && { opacity: 0.65 }]} onPress={addLoan} disabled={savingLoan}><Text style={styles.primaryText}>{savingLoan ? 'Saving...' : 'Save loan'}</Text></Pressable></View>}
        {loading ? <ActivityIndicator style={{ marginTop: 32 }} size="large" color="#C66B50" /> : loans.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>◎</Text><Text style={styles.emptyTitle}>No loans yet</Text><Text style={styles.muted}>Add your first entry to start tracking.</Text></View> : <FlatList data={loans.filter(item => activeTab === 'pending' ? !item.isRepaid : activeTab === 'history' ? item.isRepaid : true)} scrollEnabled={false} keyExtractor={item => item.id} contentContainerStyle={{ gap: 12 }} renderItem={({ item }) => <View style={[styles.loanCard, item.isOverdue && styles.overdueCard]}><View style={styles.loanTop}><View style={styles.avatar}><Text style={styles.avatarText}>{item.friendName.trim().charAt(0).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.friend}>{item.friendName}</Text><Text style={styles.due}>Due {new Date(item.dueDate).toLocaleDateString()}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={styles.loanAmount}>{money(item.amount)}</Text><Text style={[styles.status, item.isRepaid ? styles.paid : item.isOverdue ? styles.overdue : styles.pending]}>{item.isRepaid ? 'REPAID' : item.isOverdue ? 'OVERDUE' : 'PENDING'}</Text></View></View>
          {item.receiptPath && (
            <View style={styles.savedReceipt}>
              <Pressable
                style={styles.showReceiptButton}
                onPress={() =>
                  setExpandedReceiptId(current =>
                    current === item.id ? null : item.id
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={
                  expandedReceiptId === item.id
                    ? 'Hide receipt'
                    : 'Show receipt'
                }
              >
                <Text style={styles.showReceiptText}>
                  {expandedReceiptId === item.id
                    ? 'Hide receipt −'
                    : '▧  Show receipt'}
                </Text>
              </Pressable>
              {expandedReceiptId === item.id && (
                <>
                  <Text style={styles.label}>RECEIPT</Text>
                  <Image
                    source={{
                      uri: `${API_URL.replace(/\/api$/, '')}${item.receiptPath}`,
                    }}
                    style={styles.receiptPreview}
                    resizeMode="contain"
                  />
                </>
              )}
            </View>
          )}
          {!item.isRepaid && <Pressable style={styles.repayButton} onPress={() => markRepaid(item.id)}><Text style={styles.repayText}>Mark as repaid ✓</Text></Pressable>}</View>} />}
        <Text style={styles.bottomNote}>Keep your records private. MiniLedger is a tracking tool, not a payment app.</Text>
      </ScrollView>
      {!isDesktop && <View style={styles.bottomNav}>
        <Pressable style={styles.bottomNavItem} onPress={() => { setActiveTab('dashboard'); setShowForm(false); }}><Text style={[styles.bottomNavIcon, activeTab === 'dashboard' && styles.bottomNavActive]}>⌂</Text><Text style={[styles.bottomNavLabel, activeTab === 'dashboard' && styles.bottomNavActive]}>Home</Text></Pressable>
        <Pressable style={styles.bottomNavItem} onPress={() => { setActiveTab('dashboard'); setShowForm(true); }}><Text style={styles.bottomNavIcon}>＋</Text><Text style={styles.bottomNavLabel}>Add loan</Text></Pressable>
        <Pressable style={styles.bottomNavItem} onPress={() => { setActiveTab('pending'); setShowForm(false); }}><Text style={[styles.bottomNavIcon, activeTab === 'pending' && styles.bottomNavActive]}>◷</Text><Text style={[styles.bottomNavLabel, activeTab === 'pending' && styles.bottomNavActive]}>Pending</Text></Pressable>
        <Pressable style={styles.bottomNavItem} onPress={() => { setActiveTab('history'); setShowForm(false); }}><Text style={[styles.bottomNavIcon, activeTab === 'history' && styles.bottomNavActive]}>✓</Text><Text style={[styles.bottomNavLabel, activeTab === 'history' && styles.bottomNavActive]}>History</Text></Pressable>
      </View>}
    </View></View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({

  safe: { flex: 1, backgroundColor: '#F7F0E7' }, loginWrap: { flex: 1, justifyContent: 'center', padding: 24 }, logo: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#C66B50', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 }, logoText: { color: '#FFFCF7', fontSize: 30, fontWeight: '800' }, brand: { fontSize: 30, fontWeight: '800', color: '#493B35', textAlign: 'center', letterSpacing: -0.8 }, subtitle: { textAlign: 'center', color: '#786E64', marginTop: 5, marginBottom: 28 }, panel: { backgroundColor: '#FFFCF7', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: '#E8DED1', marginBottom: 16 }, heading: { fontSize: 21, fontWeight: '700', color: '#493B35', marginBottom: 6 }, muted: { color: '#786E64', fontSize: 13, lineHeight: 19 }, label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: '#786E64', marginTop: 20, marginBottom: 8 }, input: { backgroundColor: '#FFFCF7', borderWidth: 1, borderColor: '#E8DED1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#493B35' }, primary: { backgroundColor: '#C66B50', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 20 }, primaryText: { color: '#FFFCF7', fontWeight: '700', fontSize: 14 }, link: { color: '#C66B50', textAlign: 'center', marginTop: 16, fontWeight: '600' }, footnote: { textAlign: 'center', color: '#9A8D81', fontSize: 11, marginTop: 10 }, topbar: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFCF7',
    borderBottomWidth: 1,
    borderBottomColor: '#E8DED1',
  },
  logout: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F0E3D5',
  }, logoutText: { color: '#704737', fontSize: 12, fontWeight: '700' }, content: { paddingHorizontal: 20, paddingBottom: 30 }, greeting: { color: '#493B35', fontSize: 23, fontWeight: '800', letterSpacing: -0.5, marginTop: 4, marginBottom: 5 }, brandSmall: {
    fontSize: 21,
    fontWeight: '800',
    color: '#493B35',
  },
  mutedSmall: {
    fontSize: 11,
    color: '#786E64',
    marginTop: 2,
  }, summaryCard: { marginTop: 20, backgroundColor: '#493B35', borderRadius: 22, padding: 22 }, summaryEyebrow: { color: '#D6B77A', fontSize: 10, fontWeight: '800', letterSpacing: 1.6 }, total: { color: '#FFFCF7', fontSize: 34, fontWeight: '800', marginTop: 7, letterSpacing: -1 }, summaryDivider: { height: 1, backgroundColor: '#5B4B43', marginVertical: 18 }, summaryRow: { flexDirection: 'row' }, summaryMetric: { flex: 1 }, metricLabel: { color: '#D8C9BC', fontSize: 12, marginBottom: 6 }, metricValue: { color: '#FFFCF7', fontWeight: '700', fontSize: 17 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 14 }, sectionTitle: { fontSize: 18, fontWeight: '800', color: '#493B35' }, addButton: { backgroundColor: '#C66B50', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 13 }, addButtonText: { color: '#FFFCF7', fontSize: 12, fontWeight: '700' }, receiptButton: { borderWidth: 1, borderColor: '#D6B77A', borderStyle: 'dashed', padding: 13, borderRadius: 10, marginTop: 16 }, receiptText: { color: '#C66B50', fontSize: 12, fontWeight: '600', textAlign: 'center' }, empty: { alignItems: 'center', padding: 30, backgroundColor: '#FFFCF7', borderRadius: 18, marginTop: 2 }, emptyIcon: { fontSize: 32, color: '#C66B50', marginBottom: 8 }, emptyTitle: { fontSize: 16, fontWeight: '800', color: '#493B35', marginBottom: 5 }, loanCard: { backgroundColor: '#FFFCF7', borderRadius: 17, padding: 15, borderWidth: 1, borderColor: '#E8DED1' }, overdueCard: { backgroundColor: '#FCEDE8', borderColor: '#E8B7A9' }, loanTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F0E3D5', alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 17, fontWeight: '800', color: '#C66B50' }, friend: { fontSize: 14, fontWeight: '800', color: '#493B35' }, due: { color: '#8B7D72', fontSize: 11, marginTop: 4 }, loanAmount: { color: '#493B35', fontSize: 16, fontWeight: '800' }, status: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7, marginTop: 5 }, paid: { color: '#47775B' }, overdue: { color: '#c94f45' }, pending: { color: '#B98235' }, repayButton: { alignSelf: 'flex-end', backgroundColor: '#F0E3D5', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, marginTop: 14 }, repayText: { color: '#C66B50', fontSize: 11, fontWeight: '700' }, bottomNote: { color: '#8B7D72', textAlign: 'center', fontSize: 10, lineHeight: 16, marginTop: 24, paddingHorizontal: 12 },

  receiptPreview: {
    width: '100%',
    height: 200,
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#F7F0E7',
  },
  savedReceipt: {
    marginTop: 12,
  },
  appShell: { flex: 1, flexDirection: 'column' },
  desktopShell: { flexDirection: 'row' },
  sidebar: { width: 244, backgroundColor: '#493B35', borderRightWidth: 1, borderRightColor: '#5B4B43', padding: 18 },
  sidebarBrand: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 28 },
  sidebarLogo: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#C66B50', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  sidebarTitle: { color: '#FFFCF7', fontSize: 22, fontWeight: '800' },
  sidebarTagline: { color: '#D8C9BC', fontSize: 11, marginTop: 4 },
  navItem: { paddingVertical: 13, paddingHorizontal: 12, borderRadius: 11, marginBottom: 5 },
  navItemActive: { backgroundColor: '#5B4B43' },
  navText: { color: '#D8C9BC', fontSize: 13, fontWeight: '600' },
  navTextActive: { color: '#F0B49F', fontWeight: '800' },
  sidebarSpacer: { flex: 1, minHeight: 20 },
  sidebarLogout: { backgroundColor: '#F0E3D5', padding: 12, borderRadius: 10, alignItems: 'center' },
  mainArea: { flex: 1, minWidth: 0 },
  bottomNav: { flexDirection: 'row', backgroundColor: '#FFFCF7', borderTopWidth: 1, borderTopColor: '#E8DED1', paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 18 : 8, paddingHorizontal: 6 },
  bottomNavItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 3, gap: 2 },
  bottomNavIcon: { color: '#8B7D72', fontSize: 20, fontWeight: '700' },
  bottomNavLabel: { color: '#8B7D72', fontSize: 10, fontWeight: '600' },
  bottomNavActive: { color: '#C66B50' },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    marginTop: -4,
    marginBottom: 8,
  },
  showReceiptButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#E8DED1',
    backgroundColor: '#F7F0E7',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 9,
    marginTop: 4,
  },
  showReceiptText: {
    color: '#C66B50',
    fontSize: 12,
    fontWeight: '700',
  },
  mobileBrand: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
},
mobileLogo: {
  width: 38,
  height: 38,
  borderRadius: 12,
  backgroundColor: '#C66B50',
  alignItems: 'center',
  justifyContent: 'center',
},
mobileLogoText: {
  color: '#FFFCF7',
  fontSize: 23,
  fontWeight: '800',
},
});
