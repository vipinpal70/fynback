"use client";

import { useEffect } from "react";

export default function ScrollObserver() {
	useEffect(() => {
		const observerOptions = {
			root: null,
			rootMargin: "0px 0px -50px 0px",
			threshold: 0.05,
		};

		const observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add("visible");
					// Once visible, we can stop observing this element
					observer.unobserve(entry.target);
				}
			});
		}, observerOptions);

		const elements = document.querySelectorAll(
			".animate-on-scroll, .slide-left-on-scroll",
		);
		elements.forEach((el) => observer.observe(el));

		return () => {
			elements.forEach((el) => observer.unobserve(el));
			observer.disconnect();
		};
	}, []);

	return null;
}
