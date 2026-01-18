import { createApp, reactive, ref, computed, watch, onMounted, toRaw } from '../lib/vue.esm-browser.js';
import * as ntools from './node-utils.js';
import { createApp, reactive, ref, computed, watch, onMounted, toRaw } from '../lib/vue.esm-browser.js';
import * as ntools from './node-utils.js';
const apiUrl = 'https://map.meshcore.dev/api/v1/nodes';

let presets = [];

const types = {
	'1': 'Client',
	'2': 'Repeater',
	'3': 'Room Server',
	'4': 'Sensor'
};

const updateStatusDesc = {
	'none': 'manualy added',
	'recent': 'updated recently',
	'stale': 'updated while ago',
	'old': 'not updated',
	'extinct': 'will be deleted soon'
};

const radioParamDesc = {
	'bw': {
		label: 'Bandwidth',
		unit: 'kHz'
	},
	'freq': {
		label: 'Frequency',
		unit: 'MHz',
	},
	'sf': {
		label: 'Spreading factor',
		unit: '',
	},
	'cr': {
		label: 'Coding rate',
		unit: '',
	},
};

const columnOrder = ['adv_name', 'type', 'status', 'link', 'inserted_date', 'updated_date', 'public_key', 'coords', 'preset', 'params' ];
const columns = {
	coords: {
		label: 'Coordinates',
		value: (val) => `<a target="_blank" href="https://google.com/maps/place/${val.replace(' ', '')}">${val}</a>`
	},
	adv_name: {
		label: 'Name',
		value: (val) => escape(val)
	},
	status: {
		label: 'Update status',
		value: (val) => updateStatusDesc[val]
	},
	inserted_date: {
		label: 'Inserted',
		value: (val) => {
			const dt = new Date(val);
			return `<time datetime="${val}" title="${dt.toLocaleString()}">${timeAgo(dt.getTime())}</time>`
		}
	},
	updated_date: {
		label: 'Updated',
		value: (val) => {
			const dt = new Date(val);
			return `<time datetime="${val}" title="${dt.toLocaleString()}">${timeAgo(dt.getTime())}</time>`
		}
	},
	public_key: {
		label: 'Public key'
	},
	type: {
		label: 'Type',
		value: (val) => types[val]
	},
	preset: {
		label: 'Radio preset',
		value: (val) => {
			const preset = findPreset(val) || {};
			console.log({ val, preset });
			return preset?.params?.freq ? preset.name : 'Custom'
		}
	},
	params: {
		label: 'Radio params',
		value: (val) => (Object.entries(val).map(([key, val]) => {
				const paramKey = radioParamDesc[key];
				return escape(`${paramKey.label}: ${val}${paramKey.unit}`)
			}).join('<br>')
		)
	},
	link: {
		label: 'Meshcore link',
		value: (val) => `<a href="javascript:navigator.clipboard.writeText('${val}')">Copy to clipboard</a>`
	},
};

function timeAgo(msec) {
	const seconds = Math.floor((Date.now() - msec) / 1000);

	const units = [
		{ name: 'year', limit: 31536000 },
		{ name: 'month', limit: 2592000 },
		{ name: 'day', limit: 86400 },
		{ name: 'hour', limit: 3600 },
		{ name: 'minute', limit: 60 },
		{ name: 'second', limit: 1 }
	];

	for (const unit of units) {
		const count = Math.floor(seconds / unit.limit);

		if (count >= 1) {
			return `${count} ${unit.name}${count > 1 ? 's' : ''} ago`;
		}
	}

	return 'just now';
}

function escape(html) {
	return html.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

function getSvgIconUrl(text, color) {
	const svg = `
	<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg" >
		<style>
		text { font: bold 150pt sans-serif; fill: #fff; }
		</style>
		<ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill="${color}"/>
		<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle">${text}</text>
	</svg>`;

	return L.icon({
		iconUrl: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })),
		iconSize: [32, 32],
		iconAnchor: [17, 17],
		popupAnchor: [0, -16],
	});
}

function clearLocationHash () {
	history.pushState('', document.title, location.pathname + location.search);
}

function getTable(node) {
	return '<table class="node-info"><tbody>'+
		'<tr>' + columnOrder.flatMap(key => node[key] ? [`<td><b>${columns[key].label}</b></td><td>${ columns[key].value ? columns[key].value(node[key]) : node[key] }</td>`] : [] ).join('</tr><tr>') + '</tr>'+
	'</tbody></table>';
}

function getNodePopupHTML(node) {
	const userActionUrl = encodeURI(localStorage.getItem('userActionUrl') || '');
	const userActionLabel = localStorage.getItem('userActionLabel') || '';
	const userActionAnchor = userActionUrl ? `
		<a target="_blank" href="https://${userActionUrl}?nodes=${node.public_key}">${userActionLabel}</a>
	` : '';

	return `
		${getTable(node)}
		<div class="user-actions">
			<a href="${getDeletionMailUrl(node)}" target="_blank">Request node deletion</a>
			${userActionAnchor}
		</div>
	`;
}

async function getPresets() {
	if(presets.length) return presets;

	const res = await fetch('https://api.meshcore.nz/api/v1/config');
	const presetsApi = (await res.json()).config.suggested_radio_settings.entries;

	presets = presetsApi.map(p => ({
		name: p.title,
		desc: p.description,
		params: {
			freq: p.frequency,
			bw: p.bandwidth,
			sf: p.spreading_factor,
			cr: p.coding_rate
		}
	}));

	presets.unshift({
		name: 'All presets',
		params: {}
	});

	return presets;
}

function findPreset(params) {
	return presets.find(p =>
		params.sf == p.params.sf &&
		params.freq == p.params.freq &&
		params.bw == p.params.bw
	) ?? {}
}

window.isNewerThan = (date, days) => {
	const daysMs = 1000 * 3600 * 24 * days;
	const dateMs = new Date(date).getTime();

	return dateMs > Date.now() - daysMs;
}

function getDeletionMailUrl(node) {
	const deletionMailUrl = new URL('mailto:recrof@gmail.com');
	deletionMailUrl.searchParams.append('subject', 'MeshCore Map node deletion request');
	deletionMailUrl.searchParams.append('body', [
		'Please delete my node(s) from MeshCore Map database',
		'MeshCore link(s) or Public key(s):',
		'',
		node ? node.public_key : '',
		'',
		'*** IMPORTANT ***',
		'if you have multiple nodes to delete, put them into single email, delimited by newline. public key is enough, you don\'t need to add name or screenshot of the node.',
	].join('\n')
	);

	return deletionMailUrl.toString().replaceAll('+', '%20').replaceAll('\n', '%0A');
}

const appAttribution = `
	App: recrof, <a target="_blank" href="https://github.com/sponsors/recrof?frequency=one-time&sponsor=recrof">
	<strong>support my work</strong></a> |
	<a target="_blank" href="${getDeletionMailUrl()}"><strong>Node deletion request</strong></a>
`;

const baseMapSelected = localStorage.getItem('baseMapSelected') || 'OpenStreetMap';
const baseMaps = {
	'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: `Tiles: &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> | ${appAttribution}`
	}),
	'Esri Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
		maxZoom: 18,
		attribution: `Tiles: &copy; Esri | Sources: Esri, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, GIS Users | ${appAttribution}`,
	}),
};

let params = { lat: 7, lon: 25, zoom: 3 };
let params = { lat: 7, lon: 25, zoom: 3 };

const urlParams = Object.fromEntries(new URLSearchParams(location.search));
if(Number(urlParams.lat) && Number(urlParams.lon) && Number(urlParams.zoom)) {
	params = urlParams
if(Number(urlParams.lat) && Number(urlParams.lon) && Number(urlParams.zoom)) {
	params = urlParams
}

// console.log(params);

const map = window.leafletMap = leaflet.map('map', {
	minZoom: 2,
	maxBounds: [
		[-90, -180], // top left
		[90, 200], // bottom right
	],
	layers: baseMaps[baseMapSelected],
	zoomControl: false
}).setView([params.lat, params.lon], params.zoom);

map.on('baselayerchange', function(ev) {
	localStorage.setItem('baseMapSelected', ev.name);
});

L.control.layers(baseMaps, null, { position: 'bottomleft' }).addTo(map);

// map.zoomControl.setPosition('bottomleft');
const icons = Object.fromEntries(['none', 'recent', 'stale', 'old', 'extinct'].map(color => [color,
	Object.fromEntries([1, 2, 3, 4].map(id => [id, L.icon({
		iconUrl: `img/node_types/${id}.svg`,
		iconSize: [32, 32],
		iconAnchor: [17, 17],
		popupAnchor: [0, -16],
		className: `update-${color}`
	})]))
]));

createApp({
	setup() {
		const app = window.app = reactive({
			nodes: [],
			nodesByType: {},
			filteredNodes: [],
			nodes: [],
			nodesByType: {},
			filteredNodes: [],
			search: '',
			link: '',
			nodeFilter: [],
			fromDate: '',
			clusteringZoom: 12,
			urlParams,
			presets,
			presetIndex: 0,
			loading: false,
		});

		async function refreshMap({ clusteringZoom = 0 } = {}) {
			markerClusterGroup.clearLayers();
			const nodes = app.filteredNodes.length > 0 ? app.filteredNodes : app.nodes;

			map.removeLayer(markerClusterGroup);

			if(clusteringZoom) {
				markerClusterGroup = L.markerClusterGroup({
					disableClusteringAtZoom: clusteringZoom
				});
			}

			for(const node of nodes) {
				markerClusterGroup.addLayer(toRaw(node.marker));
			}

			map.addLayer(markerClusterGroup);
		}

		function showNode(node) {
			node.marker.openPopup();
			map.flyTo(node.marker.getLatLng(), 19);
			app.search = '';
		}

		function highlightString(source, toHighlight) {
			const escapedSource = source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
			const matchIndex = source.toLowerCase().indexOf(toHighlight.toLowerCase());
			const highlightString = matchIndex >= 0 ? source.substring(matchIndex, matchIndex + toHighlight.length) : toHighlight;
			return escapedSource.replace(highlightString, `<b>${highlightString}</b>`);
		}

		function clearFilters() {
			app.nodeFilter = [1, 2, 3, 4];
			app.fromDate = '2025-03-01';
			app.cluster = 12;
			app.presetIndex = 0;
		}

		function getDaysEpochMsec(days) {
			return days * 24 * 60 * 60 * 1000;
		}

		function getNodeUpdateStatus(node) {
			if(node.source !== 'uploader') return 'none';
			const updateEpoch = new Date(node.updated_date).getTime();
			if(updateEpoch < Date.now() - getDaysEpochMsec(20)) return 'extinct';
			else if(updateEpoch < Date.now() - getDaysEpochMsec(10)) return 'old';
			else if(updateEpoch < Date.now() - getDaysEpochMsec(5)) return 'stale';

			return 'recent';
		}

		async function downloadNodes() {
			try {
				app.loading = true;
				const nodesReq = await fetch(apiUrl);
				app.nodes = await nodesReq.json();

				getPresets().then((presets) => {
					app.presets = presets;
				});

				for(const node of app.nodes) {
					const updateStatus = getNodeUpdateStatus(node);
					let icon = icons[updateStatus][node.type.toString()];

					(app.nodesByType[node.type] ??= []).push(node);

					if(node.type === 1) {
						const label = ntools.getNameIconLabel(node.adv_name);
						const color = ntools.getColourForName(node.adv_name);
						icon = getSvgIconUrl(label, color);
					}

					const marker = node.marker = L.marker(
						[node.adv_lat, node.adv_lon], { icon, title: node.adv_name }
					);

					node.status = updateStatus;
					node.preset = node.params;
					node.coords = `${node.adv_lat.toFixed(4)}, ${node.adv_lon.toFixed(4)}`;
					node.lastAdvertDate = new Date(node.last_advert);
					node.insertDate = new Date(node.inserted_date);
					node.updatedDate = node.updated_date && new Date(node.updated_date);
					const popup = L.popup({ minWidth: 350, maxWidth: 350, content: () => getNodePopupHTML(node) });
					marker.bindPopup(popup);
				}
			}
			catch(e) {
				alert('There was an error loading map nodes:', e);
			}
			finally {
				app.loading = false;
			}
		}

		clearFilters();

		const filtersActive = computed(() => app.filteredNodes.length && app.nodes.length !== app.filteredNodes.length);

		watch(
			[
				() => app.nodeFilter,
				() => app.fromDate,
			],
			() => {
				const fromDate = new Date(app.fromDate);
				app.filteredNodes = app.nodeFilter
					.flatMap(type => app.nodesByType[type])
					.filter(node => node && (node.updatedDate ? node.updatedDate > fromDate : node.insertDate > fromDate));
				console.log('refresh', app.nodeFilter, app.filteredNodes.length);
				app.urlParams.nodes = app.nodeFilter.join(',');
				app.urlParams.date = app.fromDate;
				refreshMap({ download: false });
			}
		);

		watch(() => app.clusteringZoom, () => {
			app.urlParams.cluster = app.clusteringZoom;
			refreshMap({ download: false, clusteringZoom: app.clusteringZoom });
		});

		const stats = computed(() => {
			const nodes = app.nodes;

			if(!nodes) return [];

			const result = [];
			result.push(`
				<span>total: <b>${nodes.length}</b></span>&nbsp;|
				<i class="node-type pointer-help" title="Total client nodes">person</i><b>${nodes.filter(n => n.type === 1).length}</b>&nbsp;|
				<i class="node-type pointer-help" title="Total repeater nodes">cell_tower</i><b>${nodes.filter(n => n.type === 2).length}</b>&nbsp;|
				<i class="node-type pointer-help" title="Total room server nodes">forum</i><b>${nodes.filter(n => n.type === 3).length}</b>
			`);
			result.push(`<span class="pointer-help" title="Nodes added in last 24 hours">24h: <b>${app.nodes.filter(n => isNewerThan(n.inserted_date, 1)).length}</b></span>`);
			result.push(`<span class="pointer-help" title="Nodes added in last 7 days">7d: <b>${app.nodes.filter(n => isNewerThan(n.inserted_date, 7)).length}</b></span>`);
			result.push(`<span class="pointer-help" title="Nodes added in last 30 days">30d: <b>${app.nodes.filter(n => isNewerThan(n.inserted_date, 30)).length}</b></span>`);

			return result;
		});

		const searchResults = computed(() => {
			if(!app.search) { return [] }
			const nodes = app.filteredNodes.length > 0 ? app.filteredNodes : app.nodes;

			const results = nodes.filter(
				node => node.adv_name.toLowerCase().includes(app.search.toLowerCase()) || node.public_key.startsWith(app.search)
			).toSorted(
				(a, b) => a.adv_name.localeCompare(b.adv_name)
			).slice(0, 20);

			return results;
		});

		let markerClusterGroup = L.markerClusterGroup({
			disableClusteringAtZoom: app.clusteringZoom
		});

		watch(
			() => app.urlParams,
			() => {
				history.replaceState({}, '', `/?${new URLSearchParams(app.urlParams)}`);
			},
			{ deep: true }
		);

		map.on('moveend', function(e) {
			const pos = map.getCenter();
			const zoom = map.getZoom();
			app.urlParams.zoom = zoom;
			app.urlParams.lat = pos.lat.toFixed(4);
			app.urlParams.lon = pos.lng.toFixed(4);
			app.urlParams.zoom = zoom;
			app.urlParams.lat = pos.lat.toFixed(4);
			app.urlParams.lon = pos.lng.toFixed(4);
		});

		onMounted(() => {
			downloadNodes().then(() => {
				if(urlParams.nodes) {
					app.nodeFilter = urlParams.nodes.split(',');
				}
				if(urlParams.date) {
					app.fromDate = urlParams.date
				}
				if(urlParams.cluster) {
					app.clusteringZoom = urlParams.cluster;
				}
				refreshMap();
			})

		})

		window.refreshMap = refreshMap;

		return {
			app, refreshMap,
			stats, searchResults, filtersActive,
			showNode, highlightString,
			clearFilters
		}
	},
}).mount('#app')
