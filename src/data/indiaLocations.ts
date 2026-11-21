export interface IndiaCity {
  name: string;
  latitude: number;
  longitude: number;
}

export interface IndiaStateUT {
  name: string;
  code: string;
  type: 'state' | 'ut';
  cities: IndiaCity[];
}

/**
 * Factual administrative reference of all 28 Indian States and 8 Union Territories
 * with real geographic coordinates for Pan-India location selection.
 */
export const INDIA_STATES_AND_UTS: IndiaStateUT[] = [
  // 28 States
  {
    name: 'Andhra Pradesh',
    code: 'AP',
    type: 'state',
    cities: [
      { name: 'Amaravati', latitude: 16.5131, longitude: 80.5165 },
      { name: 'Visakhapatnam', latitude: 17.6868, longitude: 83.2185 },
      { name: 'Vijayawada', latitude: 16.5062, longitude: 80.648 },
      { name: 'Tirupati', latitude: 13.6288, longitude: 79.4192 },
    ],
  },
  {
    name: 'Arunachal Pradesh',
    code: 'AR',
    type: 'state',
    cities: [
      { name: 'Itanagar', latitude: 27.0844, longitude: 93.6053 },
      { name: 'Tawang', latitude: 27.5861, longitude: 91.8594 },
      { name: 'Pasighat', latitude: 28.0662, longitude: 95.3263 },
    ],
  },
  {
    name: 'Assam',
    code: 'AS',
    type: 'state',
    cities: [
      { name: 'Guwahati', latitude: 26.1445, longitude: 91.7362 },
      { name: 'Dispur', latitude: 26.1433, longitude: 91.7898 },
      { name: 'Dibrugarh', latitude: 27.4728, longitude: 94.912 },
      { name: 'Silchar', latitude: 24.8333, longitude: 92.7789 },
    ],
  },
  {
    name: 'Bihar',
    code: 'BR',
    type: 'state',
    cities: [
      { name: 'Patna', latitude: 25.5941, longitude: 85.1376 },
      { name: 'Gaya', latitude: 24.7914, longitude: 85.0002 },
      { name: 'Muzaffarpur', latitude: 26.1209, longitude: 85.3647 },
      { name: 'Bhagalpur', latitude: 25.2425, longitude: 86.9842 },
    ],
  },
  {
    name: 'Chhattisgarh',
    code: 'CG',
    type: 'state',
    cities: [
      { name: 'Raipur', latitude: 21.2514, longitude: 81.6296 },
      { name: 'Bilaspur', latitude: 22.0797, longitude: 82.1409 },
      { name: 'Durg', latitude: 21.1904, longitude: 81.2849 },
    ],
  },
  {
    name: 'Goa',
    code: 'GA',
    type: 'state',
    cities: [
      { name: 'Panaji', latitude: 15.4909, longitude: 73.8278 },
      { name: 'Margao', latitude: 15.2832, longitude: 73.9862 },
      { name: 'Vasco da Gama', latitude: 15.3982, longitude: 73.8113 },
    ],
  },
  {
    name: 'Gujarat',
    code: 'GJ',
    type: 'state',
    cities: [
      { name: 'Ahmedabad', latitude: 23.0225, longitude: 72.5714 },
      { name: 'Gandhinagar', latitude: 23.2156, longitude: 72.6369 },
      { name: 'Surat', latitude: 21.1702, longitude: 72.8311 },
      { name: 'Vadodara', latitude: 22.3072, longitude: 73.1812 },
      { name: 'Rajkot', latitude: 22.3039, longitude: 70.8022 },
    ],
  },
  {
    name: 'Haryana',
    code: 'HR',
    type: 'state',
    cities: [
      { name: 'Gurugram', latitude: 28.4595, longitude: 77.0266 },
      { name: 'Faridabad', latitude: 28.4089, longitude: 77.3178 },
      { name: 'Ambala', latitude: 30.3782, longitude: 76.7767 },
      { name: 'Karnal', latitude: 29.6857, longitude: 76.9905 },
    ],
  },
  {
    name: 'Himachal Pradesh',
    code: 'HP',
    type: 'state',
    cities: [
      { name: 'Shimla', latitude: 31.1048, longitude: 77.1734 },
      { name: 'Dharamshala', latitude: 32.219, longitude: 76.3234 },
      { name: 'Mandi', latitude: 31.7088, longitude: 76.932 },
    ],
  },
  {
    name: 'Jharkhand',
    code: 'JH',
    type: 'state',
    cities: [
      { name: 'Ranchi', latitude: 23.3441, longitude: 85.3096 },
      { name: 'Jamshedpur', latitude: 22.8046, longitude: 86.2029 },
      { name: 'Dhanbad', latitude: 23.7957, longitude: 86.4304 },
    ],
  },
  {
    name: 'Karnataka',
    code: 'KA',
    type: 'state',
    cities: [
      { name: 'Bengaluru', latitude: 12.9716, longitude: 77.5946 },
      { name: 'Mysuru', latitude: 12.2958, longitude: 76.6394 },
      { name: 'Mangaluru', latitude: 12.9141, longitude: 74.856 },
      { name: 'Hubballi', latitude: 15.3647, longitude: 75.124 },
    ],
  },
  {
    name: 'Kerala',
    code: 'KL',
    type: 'state',
    cities: [
      { name: 'Thiruvananthapuram', latitude: 8.5241, longitude: 76.9366 },
      { name: 'Kochi', latitude: 9.9312, longitude: 76.2673 },
      { name: 'Kozhikode', latitude: 11.2588, longitude: 75.7804 },
      { name: 'Thrissur', latitude: 10.5276, longitude: 76.2144 },
    ],
  },
  {
    name: 'Madhya Pradesh',
    code: 'MP',
    type: 'state',
    cities: [
      { name: 'Bhopal', latitude: 23.2599, longitude: 77.4126 },
      { name: 'Indore', latitude: 22.7196, longitude: 75.8577 },
      { name: 'Gwalior', latitude: 26.2183, longitude: 78.1828 },
      { name: 'Jabalpur', latitude: 23.1815, longitude: 79.9864 },
    ],
  },
  {
    name: 'Maharashtra',
    code: 'MH',
    type: 'state',
    cities: [
      { name: 'Mumbai', latitude: 19.076, longitude: 72.8777 },
      { name: 'Pune', latitude: 18.5204, longitude: 73.8567 },
      { name: 'Nagpur', latitude: 21.1458, longitude: 79.0882 },
      { name: 'Nashik', latitude: 19.9975, longitude: 73.7898 },
      { name: 'Thane', latitude: 19.2183, longitude: 72.9781 },
    ],
  },
  {
    name: 'Manipur',
    code: 'MN',
    type: 'state',
    cities: [
      { name: 'Imphal', latitude: 24.817, longitude: 93.9368 },
      { name: 'Thoubal', latitude: 24.634, longitude: 93.9979 },
    ],
  },
  {
    name: 'Meghalaya',
    code: 'ML',
    type: 'state',
    cities: [
      { name: 'Shillong', latitude: 25.5788, longitude: 91.8933 },
      { name: 'Tura', latitude: 25.5141, longitude: 90.2032 },
    ],
  },
  {
    name: 'Mizoram',
    code: 'MZ',
    type: 'state',
    cities: [
      { name: 'Aizawl', latitude: 23.7271, longitude: 92.7176 },
      { name: 'Lunglei', latitude: 22.8884, longitude: 92.7344 },
    ],
  },
  {
    name: 'Nagaland',
    code: 'NL',
    type: 'state',
    cities: [
      { name: 'Kohima', latitude: 25.6751, longitude: 94.1086 },
      { name: 'Dimapur', latitude: 25.9091, longitude: 93.7266 },
    ],
  },
  {
    name: 'Odisha',
    code: 'OD',
    type: 'state',
    cities: [
      { name: 'Bhubaneswar', latitude: 20.2961, longitude: 85.8245 },
      { name: 'Cuttack', latitude: 20.4625, longitude: 85.883 },
      { name: 'Rourkela', latitude: 22.2604, longitude: 84.8536 },
      { name: 'Puri', latitude: 19.8135, longitude: 85.8312 },
    ],
  },
  {
    name: 'Punjab',
    code: 'PB',
    type: 'state',
    cities: [
      { name: 'Amritsar', latitude: 31.634, longitude: 74.8723 },
      { name: 'Ludhiana', latitude: 30.901, longitude: 75.8573 },
      { name: 'Jalandhar', latitude: 31.326, longitude: 75.5762 },
      { name: 'Patiala', latitude: 30.3398, longitude: 76.3869 },
    ],
  },
  {
    name: 'Rajasthan',
    code: 'RJ',
    type: 'state',
    cities: [
      { name: 'Jaipur', latitude: 26.9124, longitude: 75.7873 },
      { name: 'Jodhpur', latitude: 26.2389, longitude: 73.0243 },
      { name: 'Udaipur', latitude: 24.5854, longitude: 73.7125 },
      { name: 'Kota', latitude: 25.2138, longitude: 75.8648 },
    ],
  },
  {
    name: 'Sikkim',
    code: 'SK',
    type: 'state',
    cities: [
      { name: 'Gangtok', latitude: 27.3389, longitude: 88.6065 },
      { name: 'Namchi', latitude: 27.1667, longitude: 88.3638 },
    ],
  },
  {
    name: 'Tamil Nadu',
    code: 'TN',
    type: 'state',
    cities: [
      { name: 'Chennai', latitude: 13.0827, longitude: 80.2707 },
      { name: 'Coimbatore', latitude: 11.0168, longitude: 76.9558 },
      { name: 'Madurai', latitude: 9.9252, longitude: 78.1198 },
      { name: 'Tiruchirappalli', latitude: 10.7905, longitude: 78.7047 },
    ],
  },
  {
    name: 'Telangana',
    code: 'TS',
    type: 'state',
    cities: [
      { name: 'Hyderabad', latitude: 17.385, longitude: 78.4867 },
      { name: 'Warangal', latitude: 17.9689, longitude: 79.5941 },
      { name: 'Nizamabad', latitude: 18.6725, longitude: 78.0941 },
    ],
  },
  {
    name: 'Tripura',
    code: 'TR',
    type: 'state',
    cities: [
      { name: 'Agartala', latitude: 23.8315, longitude: 91.2868 },
      { name: 'Udaipur', latitude: 23.5333, longitude: 91.4833 },
    ],
  },
  {
    name: 'Uttar Pradesh',
    code: 'UP',
    type: 'state',
    cities: [
      { name: 'Lucknow', latitude: 26.8467, longitude: 80.9462 },
      { name: 'Noida', latitude: 28.5355, longitude: 77.391 },
      { name: 'Varanasi', latitude: 25.3176, longitude: 82.9739 },
      { name: 'Prayagraj', latitude: 25.4358, longitude: 81.8463 },
      { name: 'Kanpur', latitude: 26.4499, longitude: 80.3319 },
      { name: 'Agra', latitude: 27.1767, longitude: 78.0081 },
    ],
  },
  {
    name: 'Uttarakhand',
    code: 'UK',
    type: 'state',
    cities: [
      { name: 'Dehradun', latitude: 30.3165, longitude: 78.0322 },
      { name: 'Haridwar', latitude: 29.9457, longitude: 78.1642 },
      { name: 'Haldwani', latitude: 29.2183, longitude: 79.513 },
    ],
  },
  {
    name: 'West Bengal',
    code: 'WB',
    type: 'state',
    cities: [
      { name: 'Kolkata', latitude: 22.5726, longitude: 88.3639 },
      { name: 'Howrah', latitude: 22.5958, longitude: 88.2636 },
      { name: 'Siliguri', latitude: 26.7271, longitude: 88.3953 },
      { name: 'Durgapur', latitude: 23.5204, longitude: 87.3119 },
    ],
  },
  // 8 Union Territories
  {
    name: 'Andaman and Nicobar Islands',
    code: 'AN',
    type: 'ut',
    cities: [{ name: 'Sri Vijaya Puram (Port Blair)', latitude: 11.6234, longitude: 92.7265 }],
  },
  {
    name: 'Chandigarh',
    code: 'CH',
    type: 'ut',
    cities: [{ name: 'Chandigarh', latitude: 30.7333, longitude: 76.7794 }],
  },
  {
    name: 'Dadra and Nagar Haveli and Daman and Diu',
    code: 'DN',
    type: 'ut',
    cities: [
      { name: 'Daman', latitude: 20.3974, longitude: 72.8328 },
      { name: 'Silvassa', latitude: 20.2766, longitude: 73.0083 },
      { name: 'Diu', latitude: 20.7144, longitude: 70.9874 },
    ],
  },
  {
    name: 'Delhi (NCT)',
    code: 'DL',
    type: 'ut',
    cities: [
      { name: 'New Delhi', latitude: 28.6139, longitude: 77.209 },
      { name: 'Dwarka', latitude: 28.5921, longitude: 77.046 },
      { name: 'Rohini', latitude: 28.7495, longitude: 77.0565 },
      { name: 'Saket', latitude: 28.5245, longitude: 77.2066 },
    ],
  },
  {
    name: 'Jammu and Kashmir',
    code: 'JK',
    type: 'ut',
    cities: [
      { name: 'Srinagar', latitude: 34.0837, longitude: 74.7973 },
      { name: 'Jammu', latitude: 32.7266, longitude: 74.857 },
    ],
  },
  {
    name: 'Ladakh',
    code: 'LA',
    type: 'ut',
    cities: [
      { name: 'Leh', latitude: 34.1526, longitude: 77.5771 },
      { name: 'Kargil', latitude: 34.5539, longitude: 76.1349 },
    ],
  },
  {
    name: 'Lakshadweep',
    code: 'LD',
    type: 'ut',
    cities: [{ name: 'Kavaratti', latitude: 10.5667, longitude: 72.6417 }],
  },
  {
    name: 'Puducherry',
    code: 'PY',
    type: 'ut',
    cities: [
      { name: 'Puducherry', latitude: 11.9416, longitude: 79.8083 },
      { name: 'Karaikal', latitude: 10.9254, longitude: 79.838 },
    ],
  },
];

export const INDIA_CENTER = { latitude: 22.5937, longitude: 78.9629 };
