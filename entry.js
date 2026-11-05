// App entry. Crash capture loads first so it also catches errors thrown
// while the router and screens load. Imports run in order.
import './lib/crashCapture';
import 'expo-router/entry';
